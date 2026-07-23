// ponytail: Orders & Checkout router with strict policy check, fail-closed catalogue validation, 60s quote bounds, and opt-in simulated pay
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { Env, User } from '../types';
import { getSessionUser } from '../services/auth';
import { getPaymentGateway } from '../services/payments';
import { fulfillOrder } from '../services/fulfilment';
import { checkRateLimit } from '../services/rate-limit';
import { HeroSmsClient } from '../services/herosms';
import { getOtpSettings, calculateSellingPrice } from './otp';

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
  const validatedItems: Array<{
    product: any;
    quantity: number;
    price: number;
    service_code?: string | null;
    service_name?: string | null;
    country_code?: string | null;
    country_name?: string | null;
    max_price?: number | null;
    quote_id?: string | null;
  }> = [];

  const heroClient = new HeroSmsClient(c.env.HEROSMS_API_KEY || '', c.env.HEROSMS_BASE_URL);

  for (const item of items) {
    const productId = item.product_id || (item.product && item.product.id);
    const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1')
      .bind(productId).first<any>();

    if (!product) {
      return c.json({ error: `Produk ${productId} tidak ditemukan atau tidak aktif.` }, 400);
    }

    if (product.type === 'herosms') {
      // 1-unit quantity enforcement: reject anything else
      const rawQty = item.quantity;
      if (typeof rawQty !== 'number' || !Number.isInteger(rawQty) || rawQty !== 1) {
        return c.json({ error: 'Jumlah produk HeroSMS OTP harus tepat 1 per item.' }, 400);
      }

      // Strict boolean policy check: agreed_policy must be exactly true
      if (agreed_policy !== true) {
        return c.json({ error: 'Anda harus menyetujui syarat & kebijakan penggunaan HeroSMS OTP.' }, 400);
      }

      const settings = await getOtpSettings(c.env.DB);
      if (!settings || !settings.enabled || settings.rate <= 0) {
        return c.json({ error: 'Pengaturan harga OTP belum dikonfigurasi atau dinonaktifkan oleh admin.' }, 400);
      }

      const serviceCode = item.service_code || item.serviceCode;
      const countryCode = item.country_code ?? item.countryCode;

      // Require non-empty explicit service_code AND country_code
      if (!serviceCode || countryCode === undefined || countryCode === null || String(countryCode).trim() === '') {
        return c.json({ error: 'service_code dan country_code wajib diisi secara eksplisit.' }, 400);
      }

      const clientPrice = Number(item.price);
      const expiresAt = Number(item.expires_at || item.expiresAt);
      const now = Date.now();

      // Perform live provider catalogue lookup (fail-closed if API key set)
      let currentProviderCost: number;
      let serviceName = String(serviceCode).toUpperCase();
      let countryName = String(countryCode) === '0' ? 'Russia' : `Country ${countryCode}`;

      try {
        const [prices, servicesList, countriesList] = await Promise.all([
          heroClient.getPrices(serviceCode, String(countryCode)),
          heroClient.getServicesList(),
          heroClient.getCountries()
        ]);

        const countryPrices = prices[String(countryCode)];
        const serviceInfo = countryPrices ? countryPrices[serviceCode] : null;

        if (!serviceInfo || !serviceInfo.cost || serviceInfo.count <= 0) {
          return c.json({ error: `Nomor OTP untuk ${serviceCode} (${countryCode}) saat ini tidak tersedia.` }, 400);
        }

        const matchedService = servicesList.find((s: any) => s.code === serviceCode);
        const matchedCountry = countriesList.find((cItem: any) => String(cItem.id) === String(countryCode));

        if (!matchedService || !matchedCountry) {
          if (c.env.HEROSMS_API_KEY) {
            return c.json({ error: 'Gagal memverifikasi katalog dari provider HeroSMS' }, 502);
          }
        }

        currentProviderCost = Number(serviceInfo.cost);
        serviceName = matchedService?.name || String(serviceCode).toUpperCase();
        countryName = matchedCountry?.eng || (String(countryCode) === '0' ? 'Russia' : `Country ${countryCode}`);
      } catch {
        if (c.env.HEROSMS_API_KEY) {
          // Fail closed when configured API key lookup throws error
          return c.json({ error: 'Gagal memverifikasi katalog dari provider HeroSMS' }, 502);
        }
        // Mock/no-key mode: server-owned mock values only
        currentProviderCost = 10;
        serviceName = String(serviceCode).toUpperCase();
        countryName = String(countryCode) === '0' ? 'Russia' : `Country ${countryCode}`;
      }

      const freshSellingPrice = calculateSellingPrice(
        currentProviderCost,
        Number(settings.rate),
        Number(settings.markup_percent),
        Number(settings.min_price_idr)
      );

      // Require unexpired short-lived quote window (strictly unexpired: expiresAt >= now, max 60s lifetime + 5s transport tolerance)
      const isValidExpiryWindow = Number.isFinite(expiresAt) && expiresAt >= now && expiresAt <= (now + 65000);
      if (!Number.isFinite(clientPrice) || clientPrice <= 0 || !isValidExpiryWindow || clientPrice !== freshSellingPrice) {
        return c.json({
          error: 'Harga layanan OTP telah berubah atau kuotasi kedaluwarsa. Silakan periksa kembali keranjang Anda.',
          code: 'OTP_PRICE_CHANGED',
          freshQuote: {
            productId: product.id,
            serviceCode,
            countryCode: String(countryCode),
            freshSellingPrice,
            expiresAt: now + 60 * 1000,
            quoteId: `q_${crypto.randomUUID()}`
          }
        }, 409);
      }

      const serverQuoteId = `q_${crypto.randomUUID()}`;
      totalAmount += freshSellingPrice * 1;

      validatedItems.push({
        product,
        quantity: 1,
        price: freshSellingPrice,
        service_code: serviceCode,
        service_name: serviceName, // Authoritative server-mapped name
        country_code: String(countryCode),
        country_name: countryName, // Authoritative server-mapped name
        max_price: currentProviderCost, // Internal server max-price cap
        quote_id: serverQuoteId // Server-generated quote ID
      });
    } else {
      const qty = Math.max(1, parseInt(item.quantity || 1, 10));

      if (product.type === 'code') {
        const stockRes = await c.env.DB.prepare('SELECT COUNT(*) as count FROM stock_codes WHERE product_id = ? AND is_used = 0')
          .bind(product.id).first<any>();
        if (!stockRes || stockRes.count < qty) {
          return c.json({ error: `Stok tidak mencukupi untuk ${product.name} (Tersedia: ${stockRes?.count || 0})` }, 400);
        }
      }

      const itemPrice = Number(product.price);
      totalAmount += itemPrice * qty;
      validatedItems.push({
        product,
        quantity: qty,
        price: itemPrice
      });
    }
  }

  const orderId = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const provider = payment_provider || c.env.PAYMENT_PROVIDER || 'midtrans';

  // Create Order in D1
  await c.env.DB.prepare(`
    INSERT INTO orders (id, user_id, total_amount, payment_provider, payment_status, idempotency_key)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).bind(orderId, user.id, totalAmount, provider, idempotency_key || null).run();

  // Create Order Items with OTP snapshot
  for (const item of validatedItems) {
    await c.env.DB.prepare(`
      INSERT INTO order_items (
        id, order_id, product_id, product_name, product_type, price, quantity,
        service_code, service_name, country_code, country_name, max_price, quote_id, fulfilment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).bind(
      `item_${crypto.randomUUID()}`,
      orderId,
      item.product.id,
      item.product.name,
      item.product.type,
      item.price,
      item.quantity,
      item.service_code || null,
      item.service_name || null,
      item.country_code || null,
      item.country_name || null,
      item.max_price !== undefined ? item.max_price : null,
      item.quote_id || null
    ).run();
  }

  // Initialize Payment Transaction
  const gateway = getPaymentGateway(provider, c.env);
  const paymentResult = await gateway.createTransaction({
    orderId,
    amount: totalAmount,
    customerEmail: user.email,
    items: validatedItems.map(vi => ({
      id: vi.product.id,
      name: vi.service_name ? `${vi.product.name} (${vi.service_name})` : vi.product.name,
      price: vi.price,
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

// Order Detail with customer DTO sanitization (no max_price or provider cost/currency/herosms_id leakage)
ordersRouter.get('/:id', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const orderId = c.req.param('id');
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ? AND (user_id = ? OR ? = "admin")')
    .bind(orderId, user.id, user.role).first<any>();

  if (!order) return c.json({ error: 'Order not found' }, 404);

  const rawItems = await c.env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(orderId).all<any>();

  // Sanitize order items (strip max_price)
  const items = (rawItems.results || []).map(({ max_price, ...publicItem }) => publicItem);

  // Entitlements & Allocations
  const stockAllocations = await c.env.DB.prepare(`
    SELECT sa.*, oi.product_name FROM order_stock_allocations sa
    JOIN order_items oi ON sa.order_item_id = oi.id
    WHERE oi.order_id = ?
  `).bind(orderId).all();

  const fileEntitlements = await c.env.DB.prepare(`
    SELECT * FROM file_entitlements WHERE order_id = ?
  `).bind(orderId).all();

  const rawSmsActivations = await c.env.DB.prepare(`
    SELECT * FROM sms_activations WHERE order_id = ?
  `).bind(orderId).all<any>();

  // Sanitize sms_activations (strip provider_cost, provider_currency, herosms_id)
  const smsActivations = (rawSmsActivations.results || []).map(({ provider_cost, provider_currency, herosms_id, ...publicSms }) => publicSms);

  return c.json({
    order,
    items,
    stockCodes: stockAllocations.results || [],
    fileEntitlements: fileEntitlements.results || [],
    smsActivations
  });
});

// Dev/Test Simulated Payment Endpoint (Strictly fail-closed: disabled by default in ALL deployments unless dev opt-in env bindings match)
ordersRouter.post('/:id/simulated-pay', async (c) => {
  const isDevOptIn = c.env.APP_ENV === 'development' && c.env.ALLOW_SIMULATED_PAYMENTS === 'true';
  if (!isDevOptIn) {
    return c.json({ error: 'Simulated payment is disabled' }, 403);
  }

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
