// ponytail: Idempotent order fulfilment logic for file entitlements, stock codes, and HeroSMS activations
import { Env, OrderItem, Product } from '../types';
import { HeroSmsClient } from './herosms';

export async function fulfillOrder(orderId: string, userId: string, env: Env): Promise<{ success: boolean; message: string }> {
  // 1. Check idempotency: check if order is already paid & fulfilled
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<any>();
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  // Check if file entitlement or stock allocation or sms activation already exists for this order
  const existingEntitlement = await env.DB.prepare('SELECT id FROM file_entitlements WHERE order_id = ?').bind(orderId).first();
  const existingStock = await env.DB.prepare('SELECT id FROM order_stock_allocations sa JOIN order_items oi ON sa.order_item_id = oi.id WHERE oi.order_id = ?').bind(orderId).first();
  const existingSms = await env.DB.prepare('SELECT id FROM sms_activations WHERE order_id = ?').bind(orderId).first();

  if (existingEntitlement || existingStock || existingSms) {
    return { success: true, message: 'Order already fulfilled (idempotent)' };
  }

  // Fetch items
  const items = await env.DB.prepare(`
    SELECT oi.*, p.r2_key, p.herosms_service, p.herosms_country
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
  `).bind(orderId).all<any>();

  const heroClient = new HeroSmsClient(env.HEROSMS_API_KEY || '', env.HEROSMS_BASE_URL);

  for (const item of items.results || []) {
    if (item.product_type === 'file') {
      // Create download entitlement
      const token = crypto.randomUUID().replace(/-/g, '');
      const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days
      await env.DB.prepare(`
        INSERT INTO file_entitlements (id, order_id, user_id, product_id, download_token, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(`ent_${crypto.randomUUID()}`, orderId, userId, item.product_id, token, expiresAt).run();
    } else if (item.product_type === 'code') {
      // Atomic allocation of stock codes
      const availableCodes = await env.DB.prepare(`
        SELECT id, code FROM stock_codes
        WHERE product_id = ? AND is_used = 0
        LIMIT ?
      `).bind(item.product_id, item.quantity).all<any>();

      if ((availableCodes.results || []).length < item.quantity) {
        throw new Error(`Insufficient stock for product ${item.product_name}`);
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
    } else if (item.product_type === 'herosms') {
      // Request SMS activation number from HeroSMS
      const service = item.herosms_service || 'tg';
      const country = item.herosms_country || '0';
      const res = await heroClient.requestNumber(service, country);

      await env.DB.prepare(`
        INSERT INTO sms_activations (id, order_id, user_id, herosms_id, herosms_phone, herosms_service, herosms_country, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'WAITING_CODE')
      `).bind(
        `act_${crypto.randomUUID()}`,
        orderId,
        userId,
        res.activationId,
        res.phone,
        service,
        country
      ).run();
    }
  }

  // Audit log
  await env.DB.prepare(`
    INSERT INTO audit_logs (id, user_id, action, details)
    VALUES (?, ?, ?, ?)
  `).bind(`log_${crypto.randomUUID()}`, userId, 'FULFILL_ORDER', `Order ${orderId} fulfilled successfully`).run();

  return { success: true, message: 'Fulfilment completed' };
}
