// ponytail: Atomic per-item order fulfilment strictly keyed by order_item_id with max_price cap verification
import { Env } from '../types';
import { HeroSmsClient, HeroSmsError } from './herosms';

export async function fulfillOrder(orderId: string, userId: string, env: Env): Promise<{ success: boolean; message: string }> {
  // 1. Fetch order
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<any>();
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  // Fetch order items with product metadata
  const items = await env.DB.prepare(`
    SELECT oi.*, p.r2_key, p.herosms_service, p.herosms_country
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
  `).bind(orderId).all<any>();

  // ponytail: Only enable mock mode explicitly in development environment
  const isDev = env.APP_ENV === 'development';
  const heroClient = new HeroSmsClient(env.HEROSMS_API_KEY || '', env.HEROSMS_BASE_URL, isDev);

  for (const item of items.results || []) {
    // Skip both fulfilled and failed items so a provider failure is never retried automatically
    if (item.fulfilment_status === 'fulfilled' || item.fulfilment_status === 'failed') {
      continue;
    }

    // Atomic status transition guard: claim item pending -> processing to prevent concurrent acquisitions
    const claimRes = await env.DB.prepare("UPDATE order_items SET fulfilment_status = 'processing' WHERE id = ? AND (fulfilment_status = 'pending' OR fulfilment_status IS NULL)")
      .bind(item.id).run();

    if (claimRes.meta && claimRes.meta.changes === 0) {
      continue; // Item already claimed or processed by another request
    }

    if (item.product_type === 'file') {
      // Check existing entitlement
      const existing = await env.DB.prepare('SELECT id FROM file_entitlements WHERE order_id = ? AND product_id = ?')
        .bind(orderId, item.product_id).first();

      if (!existing) {
        const token = crypto.randomUUID().replace(/-/g, '');
        const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days
        await env.DB.prepare(`
          INSERT INTO file_entitlements (id, order_id, user_id, product_id, download_token, expires_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(`ent_${crypto.randomUUID()}`, orderId, userId, item.product_id, token, expiresAt).run();
      }

      await env.DB.prepare("UPDATE order_items SET fulfilment_status = 'fulfilled' WHERE id = ?")
        .bind(item.id).run();

    } else if (item.product_type === 'code') {
      // Check existing allocation
      const existingAlloc = await env.DB.prepare('SELECT id FROM order_stock_allocations WHERE order_item_id = ?')
        .bind(item.id).first();

      if (!existingAlloc) {
        const availableCodes = await env.DB.prepare(`
          SELECT id, code FROM stock_codes
          WHERE product_id = ? AND is_used = 0
          LIMIT ?
        `).bind(item.product_id, item.quantity).all<any>();

        if ((availableCodes.results || []).length < item.quantity) {
          await env.DB.prepare("UPDATE order_items SET fulfilment_status = 'failed', fulfilment_error = 'Insufficient stock codes' WHERE id = ?")
            .bind(item.id).run();
          continue;
        }

        for (const stock of availableCodes.results || []) {
          await env.DB.prepare(`
            UPDATE stock_codes SET is_used = 1, order_id = ? WHERE id = ? AND is_used = 0
          `).bind(orderId, stock.id).run();

          await env.DB.prepare(`
            INSERT INTO order_stock_allocations (id, order_item_id, stock_code_id, code)
            VALUES (?, ?, ?, ?)
          `).bind(`alloc_${crypto.randomUUID()}`, item.id, stock.id, stock.code).run();
        }
      }

      await env.DB.prepare("UPDATE order_items SET fulfilment_status = 'fulfilled' WHERE id = ?")
        .bind(item.id).run();

    } else if (item.product_type === 'herosms') {
      // Strict activation lookup by order_item_id
      const existingSms = await env.DB.prepare('SELECT id FROM sms_activations WHERE order_item_id = ?')
        .bind(item.id).first();

      if (existingSms) {
        await env.DB.prepare("UPDATE order_items SET fulfilment_status = 'fulfilled' WHERE id = ?")
          .bind(item.id).run();
        continue;
      }

      const service = item.service_code || item.herosms_service || 'tg';
      const country = item.country_code || item.herosms_country || '0';
      const maxPrice = item.max_price !== null && item.max_price !== undefined ? Number(item.max_price) : undefined;

      try {
        const res = await heroClient.getNumberV2(service, country, maxPrice);

        // Validate actual returned provider cost does not exceed the server-stored max_price cap
        if (res.activationCost !== undefined && maxPrice !== undefined && res.activationCost > maxPrice) {
          await heroClient.cancelActivation(res.activationId).catch(() => {});
          await env.DB.prepare("UPDATE order_items SET fulfilment_status = 'failed', fulfilment_error = 'PRICE_EXCEEDED_CAP' WHERE id = ?")
            .bind(item.id).run();

          await env.DB.prepare(`
            INSERT INTO audit_logs (id, user_id, action, details)
            VALUES (?, ?, ?, ?)
          `).bind(
            `log_${crypto.randomUUID()}`,
            userId,
            'FULFILL_OTP_ITEM_FAILED',
            `Order item ${item.id} (${service}:${country}) returned cost ${res.activationCost} exceeding maxPrice cap ${maxPrice}`
          ).run();
          continue;
        }

        await env.DB.prepare(`
          INSERT INTO sms_activations (
            id, order_item_id, order_id, user_id, herosms_id, herosms_phone, herosms_service, herosms_country,
            provider_cost, provider_currency, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'WAITING_CODE')
        `).bind(
          `act_${crypto.randomUUID()}`,
          item.id,
          orderId,
          userId,
          res.activationId,
          res.phone,
          service,
          country,
          res.activationCost ?? maxPrice ?? 0,
          res.currency || 'USD'
        ).run();

        await env.DB.prepare("UPDATE order_items SET fulfilment_status = 'fulfilled' WHERE id = ?")
          .bind(item.id).run();
      } catch (err: any) {
        const errDetails = err instanceof HeroSmsError ? err.code : (err.message || 'PROVIDER_UNAVAILABLE');

        // Persist failure per item; payment remains 'paid'; audit log failure
        await env.DB.prepare("UPDATE order_items SET fulfilment_status = 'failed', fulfilment_error = ? WHERE id = ?")
          .bind(errDetails, item.id).run();

        await env.DB.prepare(`
          INSERT INTO audit_logs (id, user_id, action, details)
          VALUES (?, ?, ?, ?)
        `).bind(
          `log_${crypto.randomUUID()}`,
          userId,
          'FULFILL_OTP_ITEM_FAILED',
          `Order item ${item.id} (${service}:${country}) failed: ${errDetails}`
        ).run();
      }
    }
  }

  // Audit log overall fulfilment
  await env.DB.prepare(`
    INSERT INTO audit_logs (id, user_id, action, details)
    VALUES (?, ?, ?, ?)
  `).bind(`log_${crypto.randomUUID()}`, userId, 'FULFILL_ORDER', `Order ${orderId} fulfilment processing completed`).run();

  return { success: true, message: 'Order fulfilment processing completed' };
}
