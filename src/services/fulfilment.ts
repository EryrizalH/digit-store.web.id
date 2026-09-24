import { Env } from '../types';
import { HeroSmsClient, HeroSmsError } from './herosms';
import { refundCredit } from './credits';
import { createInAppNotification, sendNotificationWebhook } from './notifications';

export interface CreditRefundResult {
  refunded: boolean;
  amount: number;
  alreadyRefunded?: boolean;
  reason?: 'NOT_CREDIT_PAYMENT' | 'NOT_FOUND' | 'ZERO_AMOUNT';
}

/**
 * Refund one failed order item using the amount actually charged. Item prices
 * are stored before order-level discounts, so the refund is allocated
 * proportionally from the final order total.
 */
export async function refundFailedOrderItem(
  orderId: string,
  itemId: string,
  userId: string,
  env: Env,
  source: 'auto' | 'admin' | 'otp' = 'auto'
): Promise<CreditRefundResult> {
  const item = await env.DB.prepare(
    'SELECT * FROM order_items WHERE id = ? AND order_id = ? LIMIT 1'
  ).bind(itemId, orderId).first<any>();
  if (!item) return { refunded: false, amount: 0, reason: 'NOT_FOUND' };

  const refundReference = `refund-${item.id}`;
  const existingRefund = await env.DB.prepare(
    "SELECT * FROM credit_transactions WHERE reference_id = ? AND type = 'refund' LIMIT 1"
  ).bind(refundReference).first<any>();

  const markRefunded = async () => {
    await env.DB.prepare(
      "UPDATE order_items SET fulfilment_status = 'refunded' WHERE id = ? AND fulfilment_status IN ('failed', 'refunded')"
    ).bind(item.id).run();
    const summary = await env.DB.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN fulfilment_status = 'refunded' THEN 1 ELSE 0 END) as refunded
      FROM order_items WHERE order_id = ?
    `).bind(orderId).first<any>();
    if (Number(summary?.total || 0) > 0 && Number(summary?.refunded || 0) === Number(summary.total)) {
      await env.DB.prepare(
        "UPDATE orders SET payment_status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND payment_status = 'paid'"
      ).bind(orderId).run();
    }
  };

  if (existingRefund) {
    await markRefunded();
    return { refunded: true, amount: Math.round(Number(existingRefund.amount) || 0), alreadyRefunded: true };
  }

  const debit = await env.DB.prepare(
    "SELECT id FROM credit_transactions WHERE reference_id = ? AND type = 'debit' LIMIT 1"
  ).bind(orderId).first<any>();
  if (!debit) return { refunded: false, amount: 0, reason: 'NOT_CREDIT_PAYMENT' };

  const order = await env.DB.prepare('SELECT total_amount FROM orders WHERE id = ?').bind(orderId).first<any>();
  const allItems = await env.DB.prepare(
    'SELECT price, quantity FROM order_items WHERE order_id = ?'
  ).bind(orderId).all<any>();
  const grossTotal = (allItems.results || []).reduce(
    (sum: number, row: any) => sum + Math.max(0, Number(row.price) || 0) * Math.max(0, Number(row.quantity) || 0),
    0
  );
  const itemGross = Math.max(0, Number(item.price) || 0) * Math.max(0, Number(item.quantity) || 0);
  const chargedTotal = Math.min(Math.round(grossTotal), Math.max(0, Math.round(Number(order?.total_amount) || 0)));
  const refundAmount = grossTotal > 0
    ? Math.min(Math.round(itemGross), Math.max(0, Math.floor(itemGross * chargedTotal / grossTotal)))
    : 0;
  if (refundAmount <= 0) return { refunded: false, amount: 0, reason: 'ZERO_AMOUNT' };

  await refundCredit(
    env.DB,
    userId,
    refundAmount,
    refundReference,
    `${source === 'admin' ? 'Admin' : source === 'otp' ? 'OTP failure' : 'Auto'} refund for failed item: ${item.product_name} (Order: ${orderId})`
  );
  await markRefunded();

  await env.DB.prepare(`
    INSERT INTO audit_logs (id, user_id, action, details)
    VALUES (?, ?, ?, ?)
  `).bind(
    `log_${crypto.randomUUID()}`,
    userId,
    source === 'admin' ? 'CREDIT_ADMIN_REFUND' : 'CREDIT_AUTO_REFUND',
    `Refunded IDR ${refundAmount} for failed item ${item.id} (${item.product_name}) in order ${orderId}`
  ).run();

  return { refunded: true, amount: refundAmount };
}

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

    try {
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
            WHERE product_id = ?
              AND COALESCE(status, CASE WHEN is_used = 0 THEN 'available' ELSE 'used' END) = 'available'
              AND (expires_at IS NULL OR expires_at > unixepoch())
            LIMIT ?
          `).bind(item.product_id, item.quantity).all<any>();

          const allocatedIds: string[] = [];
          for (const stock of availableCodes.results || []) {
            const updateRes = await env.DB.prepare(`
              UPDATE stock_codes SET is_used = 1, status = 'used', order_id = ?
              WHERE id = ?
                AND COALESCE(status, CASE WHEN is_used = 0 THEN 'available' ELSE 'used' END) = 'available'
                AND (expires_at IS NULL OR expires_at > unixepoch())
            `).bind(orderId, stock.id).run();

            if (updateRes.meta && updateRes.meta.changes > 0) {
              await env.DB.prepare(`
                INSERT INTO order_stock_allocations (id, order_item_id, stock_code_id, code)
                VALUES (?, ?, ?, ?)
              `).bind(`alloc_${crypto.randomUUID()}`, item.id, stock.id, stock.code).run();
              allocatedIds.push(stock.id);
              if (allocatedIds.length === item.quantity) break;
            }
          }

          if (allocatedIds.length < item.quantity) {
            // Revert any partially allocated codes to prevent oversell or stuck records
            if (allocatedIds.length > 0) {
              for (const stockId of allocatedIds) {
                await env.DB.prepare("UPDATE stock_codes SET is_used = 0, status = 'available', order_id = NULL WHERE id = ?").bind(stockId).run();
              }
              await env.DB.prepare("DELETE FROM order_stock_allocations WHERE order_item_id = ?").bind(item.id).run();
            }

            await env.DB.prepare("UPDATE order_items SET fulfilment_status = 'failed', fulfilment_error = 'Insufficient stock codes' WHERE id = ?")
              .bind(item.id).run();
            continue;
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
    } catch (unhandledErr: any) {
      // Prevent stuck 'processing' state on unexpected failure
      const errorMsg = unhandledErr?.message || 'FULFILMENT_PROCESSING_ERROR';
      await env.DB.prepare("UPDATE order_items SET fulfilment_status = 'failed', fulfilment_error = ? WHERE id = ?")
        .bind(errorMsg, item.id).run();
      await env.DB.prepare(`
        INSERT INTO audit_logs (id, user_id, action, details)
        VALUES (?, ?, ?, ?)
      `).bind(
        `log_${crypto.randomUUID()}`,
        userId,
        'FULFILL_ITEM_ERROR',
        `Item ${item.id} unhandled error: ${errorMsg}`
      ).run();
    }
  }

  // Audit log overall fulfilment
  await env.DB.prepare(`
    INSERT INTO audit_logs (id, user_id, action, details)
    VALUES (?, ?, ?, ?)
  `).bind(`log_${crypto.randomUUID()}`, userId, 'FULFILL_ORDER', `Order ${orderId} fulfilment processing completed`).run();

  // Auto-refund credits for failed items if order was paid via credits
  await autoRefundFailedItems(orderId, userId, env);
  await createInAppNotification(env.DB, userId, 'Status pengiriman diperbarui', `Detail fulfillment order ${orderId} sudah diperbarui.`, orderId);
  await sendNotificationWebhook(env, { event: 'fulfillment.updated', orderId, userId });

  return { success: true, message: 'Order fulfilment processing completed' };
}

/** Refund every failed item that belongs to a saldo-paid order. */
async function autoRefundFailedItems(orderId: string, userId: string, env: Env): Promise<void> {
  // Find all failed items for this order
  const failedItems = await env.DB.prepare(
    "SELECT * FROM order_items WHERE order_id = ? AND fulfilment_status = 'failed'"
  ).bind(orderId).all<any>();

  for (const item of failedItems.results || []) {
    await refundFailedOrderItem(orderId, item.id, userId, env, 'auto');
  }
}
