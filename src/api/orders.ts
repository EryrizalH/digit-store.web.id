// ponytail: Orders & Checkout router with server-side price validation and payment transaction creation
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { Env, User } from '../types';
import { getSessionUser } from '../services/auth';
import { getPaymentGateway } from '../services/payments';
import { fulfillOrder } from '../services/fulfilment';
import { checkRateLimit } from '../services/rate-limit';

export const ordersRouter = new Hono<{ Bindings: Env; Variables: { user?: User } }>();

// Auth middleware helper
async function getAuthUser(c: any): Promise<User | null> {
  const sessionId = getCookie(c, 'session');
  if (!sessionId) return null;
  return getSessionUser(c.env.DB, sessionId);
}

// Checkout (Create Order)
ordersRouter.post('/checkout', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const ip = c.req.header('cf-connecting-ip') || '127.0.0.1';
  const rl = await checkRateLimit(c.env.RATE_LIMIT_KV, `checkout:${user.id}`, 10, 60);
  if (!rl.success) {
    return c.json({ error: 'Checkout rate limit exceeded. Please wait.' }, 429);
  }

  const { items, payment_provider, idempotency_key, agreed_policy } = await c.req.json();
  if (!Array.isArray(items) || items.length === 0) {
    return c.json({ error: 'Cart items required' }, 400);
  }

  // Handle Idempotency Key
  if (idempotency_key) {
    const existingOrder = await c.env.DB.prepare('SELECT id, payment_status FROM orders WHERE idempotency_key = ?')
      .bind(idempotency_key).first<any>();
    if (existingOrder) {
      return c.json({ success: true, orderId: existingOrder.id, message: 'Existing order returned (idempotent)' });
    }
  }

  // Validate prices & stock server-side
  let totalAmount = 0;
  const validatedItems: Array<{ product: any; quantity: number }> = [];

  for (const item of items) {
    const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1')
      .bind(item.product_id).first<any>();

    if (!product) {
      return c.json({ error: `Product ${item.product_id} not available` }, 400);
    }

    const qty = Math.max(1, parseInt(item.quantity || 1, 10));

    // Policy check for HeroSMS
    if (product.type === 'herosms' && !agreed_policy) {
      return c.json({ error: 'You must accept the terms of service and usage policy for HeroSMS activation products' }, 400);
    }

    // Check code stock
    if (product.type === 'code') {
      const stockRes = await c.env.DB.prepare('SELECT COUNT(*) as count FROM stock_codes WHERE product_id = ? AND is_used = 0')
        .bind(product.id).first<any>();
      if (!stockRes || stockRes.count < qty) {
        return c.json({ error: `Insufficient stock for ${product.name} (Available: ${stockRes?.count || 0})` }, 400);
      }
    }

    totalAmount += product.price * qty;
    validatedItems.push({ product, quantity: qty });
  }

  const orderId = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const provider = payment_provider || c.env.PAYMENT_PROVIDER || 'midtrans';

  // Create Order in D1
  await c.env.DB.prepare(`
    INSERT INTO orders (id, user_id, total_amount, payment_provider, payment_status, idempotency_key)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).bind(orderId, user.id, totalAmount, provider, idempotency_key || null).run();

  // Create Order Items
  for (const item of validatedItems) {
    await c.env.DB.prepare(`
      INSERT INTO order_items (id, order_id, product_id, product_name, product_type, price, quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(`item_${crypto.randomUUID()}`, orderId, item.product.id, item.product.name, item.product.type, item.product.price, item.quantity).run();
  }

  // Initialize Payment Transaction
  const gateway = getPaymentGateway(provider, c.env);
  const paymentResult = await gateway.createTransaction({
    orderId,
    amount: totalAmount,
    customerEmail: user.email,
    items: validatedItems.map(vi => ({
      id: vi.product.id,
      name: vi.product.name,
      price: vi.product.price,
      quantity: vi.quantity
    }))
  });

  // Update order with payment reference ID
  if (paymentResult.paymentId) {
    await c.env.DB.prepare('UPDATE orders SET payment_id = ? WHERE id = ?').bind(paymentResult.paymentId, orderId).run();
  }

  // Audit log
  await c.env.DB.prepare(`
    INSERT INTO audit_logs (id, user_id, action, ip_address, details)
    VALUES (?, ?, ?, ?, ?)
  `).bind(`log_${crypto.randomUUID()}`, user.id, 'CREATE_ORDER', ip, `Order ${orderId} created for total ${totalAmount}`).run();

  return c.json({
    success: true,
    orderId,
    totalAmount,
    paymentProvider: provider,
    redirectUrl: paymentResult.redirectUrl,
    paymentId: paymentResult.paymentId
  });
});

// User's Order List
ordersRouter.get('/', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const orders = await c.env.DB.prepare(`
    SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC
  `).bind(user.id).all();

  return c.json({ orders: orders.results || [] });
});

// Order Detail
ordersRouter.get('/:id', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const orderId = c.req.param('id');
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ? AND (user_id = ? OR ? = "admin")')
    .bind(orderId, user.id, user.role).first<any>();

  if (!order) return c.json({ error: 'Order not found' }, 404);

  const items = await c.env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(orderId).all();

  // Entitlements & Allocations
  const stockAllocations = await c.env.DB.prepare(`
    SELECT sa.*, oi.product_name FROM order_stock_allocations sa
    JOIN order_items oi ON sa.order_item_id = oi.id
    WHERE oi.order_id = ?
  `).bind(orderId).all();

  const fileEntitlements = await c.env.DB.prepare(`
    SELECT * FROM file_entitlements WHERE order_id = ?
  `).bind(orderId).all();

  const smsActivations = await c.env.DB.prepare(`
    SELECT * FROM sms_activations WHERE order_id = ?
  `).bind(orderId).all();

  return c.json({
    order,
    items: items.results || [],
    stockCodes: stockAllocations.results || [],
    fileEntitlements: fileEntitlements.results || [],
    smsActivations: smsActivations.results || []
  });
});

// Dev/Test Simulated Payment Endpoint
ordersRouter.post('/:id/simulated-pay', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const orderId = c.req.param('id');
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<any>();
  if (!order) return c.json({ error: 'Order not found' }, 404);

  // Update order status to paid
  await c.env.DB.prepare("UPDATE orders SET payment_status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(orderId).run();

  // Trigger fulfilment
  const result = await fulfillOrder(orderId, order.user_id, c.env);

  return c.json({ success: true, message: 'Simulated payment succeeded', fulfillment: result });
});
