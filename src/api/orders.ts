import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { Env, User } from '../types';
import { getSessionUser } from '../services/auth';
import { getPaymentGateway, QrisGateway } from '../services/payments';
import { fulfillOrder } from '../services/fulfilment';
import { debitCredit, refundCredit } from '../services/credits';
import { checkRateLimit } from '../services/rate-limit';
import { HeroSmsClient } from '../services/herosms';
import { getOtpSettings, calculateSellingPrice, validateOtpSettings, createHeroSmsClient } from './otp';
import { createInAppNotification, sendNotificationWebhook } from '../services/notifications';

export const ordersRouter = new Hono<{ Bindings: Env; Variables: { user?: User } }>();

// Auth middleware helper
async function getAuthUser(c: any): Promise<User | null> {
  const sessionId = getCookie(c, 'session');
  if (!sessionId) return null;
  return getSessionUser(c.env.DB, sessionId);
}

async function requireAdmin(c: any): Promise<User | null> {
  const user = await getAuthUser(c);
  return user?.role === 'admin' ? user : null;
}

function getDeliveryStatus(paymentStatus: string, items: any[]): string {
  if (paymentStatus === 'pending') return 'awaiting_payment';
  if (paymentStatus === 'failed') return 'failed';
  if (paymentStatus === 'refunded') return 'refunded';
  if (items.length === 0) return 'processing';

  const statuses = items.map((item) => item.fulfilment_status || 'pending');
  if (statuses.every((status) => status === 'fulfilled')) return 'fulfilled';
  if (statuses.every((status) => status === 'refunded')) return 'refunded';
  if (statuses.some((status) => status === 'failed')) return 'failed';
  return 'processing';
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

  const { items, payment_provider, idempotency_key, agreed_policy, coupon_code, referral_code } = await c.req.json();
  if (!Array.isArray(items) || items.length === 0) {
    return c.json({ error: 'Cart items required' }, 400);
  }

  // Handle Idempotency Key (scoped to user)
  if (idempotency_key) {
    const existingOrder = await c.env.DB.prepare('SELECT id, payment_status FROM orders WHERE user_id = ? AND idempotency_key = ?')
      .bind(user.id, idempotency_key).first<any>();
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

  const heroClient = createHeroSmsClient(c.env);

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
        return c.json({ error: 'Jumlah produk layanan SMS OTP harus tepat 1 per item.' }, 400);
      }

      // Strict boolean policy check: agreed_policy must be exactly true
      if (agreed_policy !== true) {
        return c.json({ error: 'Anda harus menyetujui syarat & kebijakan penggunaan layanan SMS OTP.' }, 400);
      }

      const settings = await getOtpSettings(c.env.DB);
      const v = validateOtpSettings(settings);
      if (!v.valid) {
        return c.json({ error: 'Pengaturan harga OTP belum dikonfigurasi atau dinonaktifkan oleh admin.' }, 400);
      }

      if (!c.env.HEROSMS_API_KEY && c.env.APP_ENV !== 'development') {
        return c.json({ error: 'Gagal memverifikasi katalog layanan aktivasi SMS' }, 502);
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
          if (c.env.HEROSMS_API_KEY || c.env.APP_ENV !== 'development') {
            return c.json({ error: 'Gagal memverifikasi katalog layanan aktivasi SMS' }, 502);
          }
        }

        currentProviderCost = Number(serviceInfo.cost);
        serviceName = matchedService?.name || String(serviceCode).toUpperCase();
        countryName = matchedCountry?.eng || (String(countryCode) === '0' ? 'Russia' : `Country ${countryCode}`);
      } catch {
        if (c.env.HEROSMS_API_KEY || c.env.APP_ENV !== 'development') {
          // Fail closed when configured API key lookup throws error or missing config in prod
          return c.json({ error: 'Gagal memverifikasi katalog layanan aktivasi SMS' }, 502);
        }
        // Mock/no-key mode in dev: server-owned mock values only
        currentProviderCost = 0.15;
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
          error: 'Harga layanan SMS OTP telah diperbarui atau batas waktu telah berakhir. Silakan periksa kembali keranjang Anda.',
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
      const rawQty = item.quantity;
      const qty = parseInt(rawQty, 10);
      if (isNaN(qty) || qty < 1 || qty > 100) {
        return c.json({ error: 'Kuantitas tidak valid (1-100).' }, 400);
      }

      const itemPrice = Number(product.price);
      if (!Number.isFinite(itemPrice) || itemPrice <= 0) {
        return c.json({ error: 'Harga produk tidak valid.' }, 400);
      }

      if (product.type === 'code') {
        const stockRes = await c.env.DB.prepare("SELECT COUNT(*) as count FROM stock_codes WHERE product_id = ? AND COALESCE(status, CASE WHEN is_used = 0 THEN 'available' ELSE 'used' END) = 'available' AND (expires_at IS NULL OR expires_at > unixepoch())")
          .bind(product.id).first<any>();
        if (!stockRes || stockRes.count < qty) {
          return c.json({ error: `Stok tidak mencukupi untuk ${product.name} (Tersedia: ${stockRes?.count || 0})` }, 400);
        }
      }

      totalAmount += itemPrice * qty;
      validatedItems.push({
        product,
        quantity: qty,
        price: itemPrice
      });
    }
  }

  const subtotalAmount = totalAmount;
  let discountAmount = 0;
  let appliedCoupon: any = null;
  let appliedReferralCode: string | null = null;
  const normalizedCouponCode = String(coupon_code || '').trim().toUpperCase();
  if (normalizedCouponCode) {
    appliedCoupon = await c.env.DB.prepare(`
      SELECT * FROM coupons WHERE code = ? AND is_active = 1
        AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
        AND (ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP)
    `).bind(normalizedCouponCode).first<any>();
    if (!appliedCoupon) return c.json({ error: 'Kupon tidak valid atau sudah tidak aktif.', code: 'INVALID_COUPON' }, 400);
    if (subtotalAmount < Number(appliedCoupon.min_order_amount || 0)) {
      return c.json({ error: `Minimum transaksi untuk kupon ini Rp ${Number(appliedCoupon.min_order_amount).toLocaleString('id-ID')}.`, code: 'COUPON_MINIMUM_NOT_MET' }, 400);
    }
    if (appliedCoupon.max_uses !== null && Number(appliedCoupon.used_count || 0) >= Number(appliedCoupon.max_uses)) {
      return c.json({ error: 'Kuota kupon sudah habis.', code: 'COUPON_EXHAUSTED' }, 400);
    }
    discountAmount = appliedCoupon.discount_type === 'percent'
      ? subtotalAmount * Math.min(100, Math.max(0, Number(appliedCoupon.discount_value))) / 100
      : Math.max(0, Number(appliedCoupon.discount_value));
  }

  const normalizedReferralCode = String(referral_code || '').trim().toUpperCase();
  if (normalizedReferralCode) {
    const referrer = await c.env.DB.prepare('SELECT id FROM users WHERE referral_code = ?').bind(normalizedReferralCode).first<{ id: string }>();
    if (!referrer || referrer.id === user.id) return c.json({ error: 'Referral code tidak valid.', code: 'INVALID_REFERRAL' }, 400);
    appliedReferralCode = normalizedReferralCode;
    // Referral incentive is bounded to Rp10.000 and composes with coupons.
    discountAmount += Math.min(10000, Math.round(subtotalAmount * 0.05));
  }

  // Bundle discounts are configured by admin as a set of product IDs. The
  // discount is applied only when every product in the set is in the cart.
  const bundleStmt = c.env.DB.prepare('SELECT * FROM bundle_discounts WHERE is_active = 1');
  const bundleResult = typeof (bundleStmt as any).all === 'function'
    ? await (bundleStmt as any).all()
    : { results: [] };
  for (const bundle of bundleResult.results || []) {
    let ids: string[] = [];
    try { ids = JSON.parse(bundle.product_ids); } catch { ids = []; }
    const cartIds = new Set(validatedItems.map((item) => String(item.product.id)));
    if (ids.length > 1 && ids.every((id) => cartIds.has(String(id)))) {
      const bundleDiscount = bundle.discount_type === 'percent'
        ? subtotalAmount * Math.min(100, Math.max(0, Number(bundle.discount_value))) / 100
        : Math.max(0, Number(bundle.discount_value));
      discountAmount += bundleDiscount;
      break;
    }
  }
  discountAmount = Math.min(subtotalAmount, Math.round(discountAmount));
  totalAmount = Math.max(0, subtotalAmount - discountAmount);

  const allowedProviders = ['qris', 'midtrans', 'xendit', 'sumopod', 'credit'];
  const provider = payment_provider || c.env.PAYMENT_PROVIDER || 'qris';
  if (!allowedProviders.includes(provider)) {
    return c.json({ error: 'Metode pembayaran tidak valid.' }, 400);
  }

  const orderId = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Create Order in D1
  await c.env.DB.prepare(`
    INSERT INTO orders (id, user_id, total_amount, payment_provider, payment_status, idempotency_key, coupon_code, discount_amount, referral_code)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `).bind(orderId, user.id, totalAmount, provider, idempotency_key || null, appliedCoupon?.code || null, discountAmount, appliedReferralCode).run();
  await createInAppNotification(c.env.DB, user.id, 'Pesanan dibuat', `Order ${orderId} menunggu pembayaran.`, orderId);
  await sendNotificationWebhook(c.env, { event: 'order.created', orderId, userId: user.id, email: user.email, amount: totalAmount, status: 'pending' });

  if (appliedCoupon) {
    await c.env.DB.prepare('INSERT INTO coupon_redemptions (id, coupon_id, order_id, user_id, discount_amount) VALUES (?, ?, ?, ?, ?)')
      .bind(`red_${crypto.randomUUID()}`, appliedCoupon.id, orderId, user.id, discountAmount).run();
    await c.env.DB.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').bind(appliedCoupon.id).run();
  }

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
  if (provider === 'credit') {
    // Credit payment: debit user balance directly
    const debitResult = await debitCredit(c.env.DB, user.id, totalAmount, orderId, `Pembayaran order ${orderId}`);
    if (!debitResult.success) {
      // Rollback: delete order and order items
      await c.env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(orderId).run();
      await c.env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(orderId).run();
      if (appliedCoupon) {
        await c.env.DB.prepare('UPDATE coupons SET used_count = CASE WHEN used_count > 0 THEN used_count - 1 ELSE 0 END WHERE id = ?').bind(appliedCoupon.id).run();
      }
      return c.json({ error: 'Saldo kredit tidak mencukupi' }, 400);
    }

    // Mark order as paid immediately
    await c.env.DB.prepare("UPDATE orders SET payment_status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(orderId).run();

    // Trigger fulfilment immediately
    const fulfillResult = await fulfillOrder(orderId, user.id, c.env);
    await createInAppNotification(c.env.DB, user.id, 'Pembayaran berhasil', `Order ${orderId} sedang diproses.`, orderId);
    await sendNotificationWebhook(c.env, { event: 'payment.paid', orderId, userId: user.id, email: user.email, amount: totalAmount, status: 'paid' });

    // Audit log
    await c.env.DB.prepare(`
      INSERT INTO audit_logs (id, user_id, action, ip_address, details)
      VALUES (?, ?, ?, ?, ?)
    `).bind(`log_${crypto.randomUUID()}`, user.id, 'CREATE_ORDER', ip, `Order ${orderId} paid with credit for total ${totalAmount}`).run();

    return c.json({
      success: true,
      orderId,
      totalAmount,
      subtotalAmount,
      discountAmount,
      couponCode: appliedCoupon?.code || null,
      referralCode: appliedReferralCode,
      paymentProvider: 'credit',
      redirectUrl: null,
      paymentId: debitResult.transaction?.id || null
    });
  }

  const gateway = getPaymentGateway(provider, c.env);
  let paymentResult;
  try {
    paymentResult = await gateway.createTransaction({
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
  } catch (err: any) {
    console.error('Failed to create payment transaction:', err);
    // Rollback order and items
    await c.env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(orderId).run();
    await c.env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(orderId).run();
    if (appliedCoupon) {
      await c.env.DB.prepare('UPDATE coupons SET used_count = CASE WHEN used_count > 0 THEN used_count - 1 ELSE 0 END WHERE id = ?').bind(appliedCoupon.id).run();
    }
    return c.json({
      error: `Gagal memproses pembayaran: ${err.message || 'Gateway error'}`,
      code: 'PAYMENT_GATEWAY_ERROR'
    }, 502);
  }

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
    subtotalAmount,
    discountAmount,
    couponCode: appliedCoupon?.code || null,
    referralCode: appliedReferralCode,
    paymentProvider: provider,
    redirectUrl: paymentResult.redirectUrl,
    paymentId: paymentResult.paymentId,
    qrString: paymentResult.qrString || null,
    qrImageUrl: provider === 'qris' && paymentResult.paymentId ? `/api/orders/${orderId}/qr` : null,
    expiresAt: paymentResult.expiresAt || null
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

// Admin order queue. It is intentionally separate from the customer list so
// operational fields are never exposed to regular users.
ordersRouter.get('/admin', async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json({ error: 'Unauthorized. Admin access required.' }, 403);

  const requestedPage = Number.parseInt(c.req.query('page') || '1', 10);
  const requestedLimit = Number.parseInt(c.req.query('limit') || '25', 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(requestedPage, 100000)) : 1;
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 25;
  const offset = (page - 1) * limit;
  const filter = c.req.query('status') || 'needs_attention';
  const allowedFilters = new Set(['all', 'needs_attention', 'pending', 'failed', 'paid', 'refunded']);
  if (!allowedFilters.has(filter)) return c.json({ error: 'Invalid order status filter' }, 400);

  const whereParts: string[] = [];
  const params: any[] = [];
  if (filter === 'pending' || filter === 'paid' || filter === 'refunded') {
    whereParts.push('o.payment_status = ?');
    params.push(filter);
  } else if (filter === 'failed') {
    whereParts.push("EXISTS (SELECT 1 FROM order_items fi WHERE fi.order_id = o.id AND fi.fulfilment_status = 'failed')");
  } else if (filter === 'needs_attention') {
    whereParts.push("(EXISTS (SELECT 1 FROM order_items fi WHERE fi.order_id = o.id AND fi.fulfilment_status = 'failed') OR EXISTS (SELECT 1 FROM order_items pi WHERE pi.order_id = o.id AND pi.fulfilment_status IN ('pending', 'processing')))");
  }
  const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

  const listQuery = `
    SELECT o.id, o.user_id, u.email, o.total_amount, o.payment_provider, o.payment_status,
      o.payment_id, o.created_at, o.updated_at,
      COUNT(oi.id) as item_count,
      COALESCE(SUM(CASE WHEN oi.fulfilment_status = 'fulfilled' THEN 1 ELSE 0 END), 0) as fulfilled_item_count,
      COALESCE(SUM(CASE WHEN oi.fulfilment_status IN ('pending', 'processing') OR oi.fulfilment_status IS NULL THEN 1 ELSE 0 END), 0) as pending_item_count,
      COALESCE(SUM(CASE WHEN oi.fulfilment_status = 'failed' THEN 1 ELSE 0 END), 0) as failed_item_count
    FROM orders o
    JOIN users u ON u.id = o.user_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    ${whereSql}
    GROUP BY o.id
    ORDER BY o.updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  const listStmt = c.env.DB.prepare(listQuery);
  const listBound = params.length > 0 ? listStmt.bind(...params) : listStmt;
  const listResult = await listBound.all();

  const countQuery = `SELECT COUNT(*) as total FROM orders o ${whereSql}`;
  const countStmt = c.env.DB.prepare(countQuery);
  const countBound = params.length > 0 ? countStmt.bind(...params) : countStmt;
  const countResult = typeof (countBound as any).first === 'function' ? await (countBound as any).first() : { total: 0 };
  const total = Number(countResult?.total || 0);

  const orders = (listResult.results || []).map((order: any) => ({
    ...order,
    item_count: Number(order.item_count || 0),
    fulfilled_item_count: Number(order.fulfilled_item_count || 0),
    pending_item_count: Number(order.pending_item_count || 0),
    failed_item_count: Number(order.failed_item_count || 0),
    delivery_status: order.payment_status === 'pending'
      ? 'awaiting_payment'
      : Number(order.failed_item_count || 0) > 0
        ? 'failed'
        : Number(order.pending_item_count || 0) > 0
          ? 'processing'
          : order.payment_status === 'refunded'
            ? 'refunded'
            : 'fulfilled'
  }));

  return c.json({
    orders,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrevious: page > 1 },
    filter
  });
});

ordersRouter.get('/admin/metrics', async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json({ error: 'Unauthorized. Admin access required.' }, 403);

  const sales = await c.env.DB.prepare(`
    SELECT COUNT(*) as paid_orders, COALESCE(SUM(total_amount), 0) as revenue
    FROM orders
    WHERE payment_status = 'paid' AND created_at >= datetime('now', '-30 days')
  `).first<any>();
  const payments = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END), 0) as pending_orders,
      COALESCE(SUM(CASE WHEN payment_status = 'failed' THEN 1 ELSE 0 END), 0) as failed_payments
    FROM orders
    WHERE created_at >= datetime('now', '-30 days')
  `).first<any>();
  const fulfillment = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(CASE WHEN oi.fulfilment_status = 'fulfilled' THEN 1 ELSE 0 END), 0) as fulfilled_items,
      COALESCE(SUM(CASE WHEN oi.fulfilment_status = 'failed' THEN 1 ELSE 0 END), 0) as failed_items,
      COUNT(oi.id) as total_items
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.payment_status = 'paid' AND o.created_at >= datetime('now', '-30 days')
  `).first<any>();
  const buyers = await c.env.DB.prepare(`
    SELECT COUNT(*) as total_buyers,
      COALESCE(SUM(CASE WHEN order_count > 1 THEN 1 ELSE 0 END), 0) as repeat_buyers
    FROM (
      SELECT user_id, COUNT(*) as order_count
      FROM orders
      WHERE payment_status = 'paid' AND created_at >= datetime('now', '-30 days')
      GROUP BY user_id
    )
  `).first<any>();
  const lowStock = await c.env.DB.prepare(`
    SELECT COUNT(*) as low_stock_products
    FROM products p
    WHERE p.type = 'code' AND p.is_active = 1
      AND (SELECT COUNT(*) FROM stock_codes sc WHERE sc.product_id = p.id
        AND COALESCE(sc.status, CASE WHEN sc.is_used = 0 THEN 'available' ELSE 'used' END) = 'available'
        AND (sc.expires_at IS NULL OR sc.expires_at > unixepoch())) <= p.low_stock_threshold
  `).first<any>();
  const topProducts = await c.env.DB.prepare(`
    SELECT oi.product_id, oi.product_name, SUM(oi.quantity) as units_sold, SUM(oi.price * oi.quantity) as revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.payment_status = 'paid' AND o.created_at >= datetime('now', '-30 days')
    GROUP BY oi.product_id, oi.product_name
    ORDER BY units_sold DESC
    LIMIT 5
  `).all<any>();

  const totalItems = Number(fulfillment?.total_items || 0);
  const fulfilledItems = Number(fulfillment?.fulfilled_items || 0);
  const totalBuyers = Number(buyers?.total_buyers || 0);
  const repeatBuyers = Number(buyers?.repeat_buyers || 0);
  return c.json({
    periodDays: 30,
    revenue: Number(sales?.revenue || 0),
    paidOrders: Number(sales?.paid_orders || 0),
    pendingOrders: Number(payments?.pending_orders || 0),
    failedPayments: Number(payments?.failed_payments || 0),
    failedItems: Number(fulfillment?.failed_items || 0),
    fulfillmentSuccessRate: totalItems > 0 ? Math.round((fulfilledItems / totalItems) * 1000) / 10 : 0,
    repeatPurchaseRate: totalBuyers > 0 ? Math.round((repeatBuyers / totalBuyers) * 1000) / 10 : 0,
    lowStockProducts: Number(lowStock?.low_stock_products || 0),
    topProducts: topProducts.results || []
  });
});

ordersRouter.get('/admin/coupons', async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json({ error: 'Unauthorized. Admin access required.' }, 403);
  const result = await c.env.DB.prepare('SELECT * FROM coupons ORDER BY created_at DESC LIMIT 100').all();
  return c.json({ coupons: result.results || [] });
});

ordersRouter.post('/admin/coupons', async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json({ error: 'Unauthorized. Admin access required.' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const code = String(body.code || '').trim().toUpperCase();
  const discountType = String(body.discount_type || 'percent');
  const discountValue = Number(body.discount_value);
  const minOrderAmount = Number(body.min_order_amount || 0);
  const maxUses = body.max_uses === null || body.max_uses === undefined || body.max_uses === '' ? null : Number(body.max_uses);
  if (!/^[A-Z0-9_-]{3,32}$/.test(code) || !['percent', 'fixed'].includes(discountType) || !Number.isFinite(discountValue) || discountValue <= 0 || !Number.isFinite(minOrderAmount) || minOrderAmount < 0 || (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) || (discountType === 'percent' && discountValue > 100)) {
    return c.json({ error: 'Data kupon tidak valid.' }, 400);
  }
  try {
    await c.env.DB.prepare(`INSERT INTO coupons (id, code, discount_type, discount_value, min_order_amount, max_uses, starts_at, ends_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`)
      .bind(`cpn_${crypto.randomUUID()}`, code, discountType, discountValue, minOrderAmount, maxUses, body.starts_at || null, body.ends_at || null).run();
  } catch {
    return c.json({ error: 'Kode kupon sudah digunakan atau gagal disimpan.' }, 409);
  }
  return c.json({ success: true, code }, 201);
});

ordersRouter.post('/admin/bundles', async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json({ error: 'Unauthorized. Admin access required.' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name || '').trim().slice(0, 120);
  const productIds = Array.isArray(body.product_ids) ? Array.from(new Set(body.product_ids.map((id: any) => String(id).trim()).filter(Boolean))) : [];
  const discountType = String(body.discount_type || 'percent');
  const discountValue = Number(body.discount_value);
  if (!name || productIds.length < 2 || !['percent', 'fixed'].includes(discountType) || !Number.isFinite(discountValue) || discountValue <= 0 || (discountType === 'percent' && discountValue > 100)) {
    return c.json({ error: 'Data bundle tidak valid. Pilih minimal dua produk.' }, 400);
  }
  await c.env.DB.prepare('INSERT INTO bundle_discounts (id, name, product_ids, discount_type, discount_value, is_active) VALUES (?, ?, ?, ?, ?, 1)')
    .bind(`bnd_${crypto.randomUUID()}`, name, JSON.stringify(productIds), discountType, discountValue).run();
  return c.json({ success: true, name }, 201);
});

ordersRouter.post('/admin/:id/retry-fulfillment', async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json({ error: 'Unauthorized. Admin access required.' }, 403);

  const orderId = c.req.param('id');
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<any>();
  if (!order) return c.json({ error: 'Order not found' }, 404);
  if (order.payment_status !== 'paid') return c.json({ error: 'Only paid orders can be fulfilled' }, 400);

  const reset = await c.env.DB.prepare("UPDATE order_items SET fulfilment_status = 'pending', fulfilment_error = NULL WHERE order_id = ? AND fulfilment_status = 'failed'")
    .bind(orderId).run();
  const fulfillment = await fulfillOrder(orderId, order.user_id, c.env);
  return c.json({ success: true, resetItems: Number(reset.meta?.changes || 0), fulfillment });
});

ordersRouter.post('/admin/:id/refund-failed', async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json({ error: 'Unauthorized. Admin access required.' }, 403);

  const orderId = c.req.param('id');
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<any>();
  if (!order) return c.json({ error: 'Order not found' }, 404);
  if (order.payment_status !== 'paid') return c.json({ error: 'Only paid orders can be refunded' }, 400);
  if (order.payment_provider !== 'credit') {
    return c.json({ error: 'Gateway refund requires provider action', code: 'REFUND_REQUIRES_PROVIDER' }, 409);
  }

  const failedItems = await c.env.DB.prepare("SELECT * FROM order_items WHERE order_id = ? AND fulfilment_status = 'failed'")
    .bind(orderId).all<any>();
  if (!failedItems.results?.length) return c.json({ error: 'No failed items need a refund' }, 400);

  let refundedAmount = 0;
  let refundedItems = 0;
  for (const item of failedItems.results) {
    const amount = Number(item.price) * Number(item.quantity);
    const refundReference = `refund-${item.id}`;
    const existingRefund = await c.env.DB.prepare("SELECT id FROM credit_transactions WHERE reference_id = ? AND type = 'refund' LIMIT 1")
      .bind(refundReference).first<any>();
    if (!existingRefund) {
      await refundCredit(c.env.DB, order.user_id, amount, refundReference, `Admin refund for failed item ${item.id}`);
    }
    await c.env.DB.prepare("UPDATE order_items SET fulfilment_status = 'refunded' WHERE id = ? AND fulfilment_status = 'failed'")
      .bind(item.id).run();
    refundedAmount += amount;
    refundedItems += 1;
  }

  return c.json({ success: true, refundedItems, refundedAmount });
});

ordersRouter.post('/:id/report', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const orderId = c.req.param('id');
  const order = await c.env.DB.prepare('SELECT id, user_id FROM orders WHERE id = ? AND user_id = ?')
    .bind(orderId, user.id).first<{ id: string; user_id: string }>();
  if (!order) return c.json({ error: 'Order not found' }, 404);

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }
  const subject = String(body.subject || 'Masalah order').trim().slice(0, 120);
  const message = String(body.message || '').trim().slice(0, 2000);
  if (message.length < 10) return c.json({ error: 'Jelaskan masalah minimal 10 karakter.' }, 400);

  const ticketId = `tkt_${crypto.randomUUID()}`;
  await c.env.DB.prepare(`
    INSERT INTO support_tickets (id, order_id, user_id, subject, message, status)
    VALUES (?, ?, ?, ?, ?, 'open')
  `).bind(ticketId, orderId, user.id, subject || 'Masalah order', message).run();

  return c.json({ success: true, ticket: { id: ticketId, order_id: orderId, subject, status: 'open' } }, 201);
});

// Order Detail with customer DTO sanitization (no max_price or provider cost/currency/herosms_id leakage)
ordersRouter.get('/:id', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const orderId = c.req.param('id');
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ? AND (user_id = ? OR ? = "admin")')
    .bind(orderId, user.id, user.role).first<any>();

  if (!order) return c.json({ error: 'Order not found' }, 404);

  const rawItems = await c.env.DB.prepare(`
    SELECT oi.*, p.slug as product_slug, p.description as product_description,
      CASE WHEN p.image_key IS NOT NULL THEN '/api/products/' || p.slug || '/artwork' ELSE NULL END as product_artwork_url
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
  `).bind(orderId).all<any>();

  // Sanitize order items (strip max_price)
  const items = (rawItems.results || []).map(({ max_price, ...publicItem }) => publicItem);
  const failedItemCount = items.filter((item: any) => item.fulfilment_status === 'failed').length;
  const pendingItemCount = items.filter((item: any) => !item.fulfilment_status || item.fulfilment_status === 'pending' || item.fulfilment_status === 'processing').length;
  const fulfilledItemCount = items.filter((item: any) => item.fulfilment_status === 'fulfilled').length;
  const isQrisPending = order.payment_status === 'pending' && order.payment_provider === 'qris' && !!order.payment_id;
  const publicOrder = {
    ...order,
    delivery_status: getDeliveryStatus(order.payment_status, items),
    failed_item_count: failedItemCount,
    pending_item_count: pendingItemCount,
    fulfilled_item_count: fulfilledItemCount,
    qris: isQrisPending ? {
      paymentId: order.payment_id,
      qrImageUrl: `/api/orders/${order.id}/qr`
    } : null
  };

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
    order: publicOrder,
    items,
    stockCodes: stockAllocations.results || [],
    fileEntitlements: fileEntitlements.results || [],
    smsActivations
  });
});

// Proxy QRIS image directly to protect user privacy and avoid exposing gateway domain
ordersRouter.get('/:id/qr', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const orderId = c.req.param('id');
  const order = await c.env.DB.prepare('SELECT payment_id, payment_provider, payment_status FROM orders WHERE id = ? AND (user_id = ? OR ? = "admin")')
    .bind(orderId, user.id, user.role).first<any>();

  if (!order || !order.payment_id || order.payment_provider !== 'qris') {
    return c.json({ error: 'QRIS not available for this order' }, 404);
  }

  const gateway = getPaymentGateway('qris', c.env) as QrisGateway;
  try {
    const qrRes = await gateway.fetchQrImage(order.payment_id);
    if (!qrRes.ok) {
      return c.json({ error: 'Failed to fetch QR image from gateway' }, qrRes.status as any);
    }
    const contentType = qrRes.headers.get('content-type') || 'image/png';
    return new Response(qrRes.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=60'
      }
    });
  } catch (err: any) {
    return c.json({ error: err.message || 'Error fetching QR image' }, 502);
  }
});

// Regenerate QRIS for an existing unpaid order
ordersRouter.post('/:id/regenerate-qris', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const orderId = c.req.param('id');
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ? AND (user_id = ? OR ? = "admin")')
    .bind(orderId, user.id, user.role).first<any>();

  if (!order) return c.json({ error: 'Order not found' }, 404);
  if (order.payment_status === 'paid') return c.json({ error: 'Order is already paid' }, 400);

  const gateway = getPaymentGateway('qris', c.env);
  let paymentResult;
  try {
    paymentResult = await gateway.createTransaction({
      orderId,
      amount: order.total_amount,
      customerEmail: user.email,
      items: []
    });
  } catch (err: any) {
    console.error('Failed to regenerate QRIS:', err);
    return c.json({
      error: `Gagal generate ulang QRIS: ${err.message || 'Gateway error'}`,
      code: 'PAYMENT_GATEWAY_ERROR'
    }, 502);
  }

  if (paymentResult.paymentId) {
    await c.env.DB.prepare('UPDATE orders SET payment_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(paymentResult.paymentId, orderId).run();
  }

  return c.json({
    success: true,
    paymentId: paymentResult.paymentId,
    qrImageUrl: `/api/orders/${orderId}/qr`,
    qrString: paymentResult.qrString || null,
    expiresAt: paymentResult.expiresAt || null
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

  if (order.user_id !== user.id && user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Update order status to paid
  await c.env.DB.prepare("UPDATE orders SET payment_status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(orderId).run();

  // Trigger fulfilment
  const result = await fulfillOrder(orderId, order.user_id, c.env);

  return c.json({ success: true, message: 'Simulated payment succeeded', fulfillment: result });
});
