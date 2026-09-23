import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { Env, User } from '../types';
import { getSessionUser } from '../services/auth';

export const productsRouter = new Hono<{ Bindings: Env }>();

// Auth middleware for Admin
async function requireAdmin(c: any, next: any) {
  const sessionId = getCookie(c, 'session');
  const user = await getSessionUser(c.env.DB, sessionId || '');
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Unauthorized. Admin access required.' }, 403);
  }
  c.set('user', user);
  await next();
}

function formatPublicProduct(p: any) {
  if (!p) return null;
  return {
    id: p.id,
    category_id: p.category_id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    price: p.price,
    type: p.type,
    herosms_service: p.herosms_service,
    herosms_country: p.herosms_country,
    delivery_mode: p.delivery_mode || 'instant',
    validity_days: p.validity_days ?? null,
    low_stock_threshold: p.low_stock_threshold ?? 5,
    is_featured: Number(p.is_featured || 0),
    sort_order: Number(p.sort_order || 0),
    is_active: p.is_active,
    created_at: p.created_at,
    category_name: p.category_name,
    stock_count: p.stock_count,
    sales_count: Number(p.sales_count || 0),
    is_low_stock: p.type === 'code' && Number(p.stock_count || 0) <= Number(p.low_stock_threshold ?? 5),
    artwork_url: p.image_key ? `/api/products/${p.slug}/artwork` : null,
  };
}

// Get Categories
productsRouter.get('/categories', async (c) => {
  const res = await c.env.DB.prepare('SELECT id, name, slug FROM categories ORDER BY name ASC').all();
  return c.json({ categories: res.results || [] });
});

// List Products (Public Catalog, or all products for admin)
productsRouter.get('/', async (c) => {
  const categorySlug = c.req.query('category');
  const search = c.req.query('q');
  const type = c.req.query('type');
  const service = c.req.query('service');
  const country = c.req.query('country');
  const rawMinPrice = c.req.query('min_price');
  const rawMaxPrice = c.req.query('max_price');
  const minPrice = rawMinPrice === undefined ? null : Number(rawMinPrice);
  const maxPrice = rawMaxPrice === undefined ? null : Number(rawMaxPrice);
  const inStock = c.req.query('in_stock') === '1';
  const instantOnly = c.req.query('instant') === '1';
  const sort = c.req.query('sort') || 'newest';
  const requestedPage = Number.parseInt(c.req.query('page') || '1', 10);
  const requestedLimit = Number.parseInt(c.req.query('limit') || '24', 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(requestedPage, 100000)) : 1;
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 48)) : 24;
  const offset = (page - 1) * limit;
  const includeAll = c.req.query('include_all') === '1';

  if (includeAll) {
    const sessionId = getCookie(c, 'session');
    const user = await getSessionUser(c.env.DB, sessionId || '');
    if (!user || user.role !== 'admin') {
      return c.json({ error: 'Unauthorized. Admin access required.' }, 403);
    }
  }

  const allowedTypes = new Set(['file', 'code', 'herosms']);
  if (type && !allowedTypes.has(type)) {
    return c.json({ error: 'Invalid product type filter' }, 400);
  }
  if ((minPrice !== null && (!Number.isFinite(minPrice) || minPrice < 0)) ||
      (maxPrice !== null && (!Number.isFinite(maxPrice) || maxPrice < 0)) ||
      (minPrice !== null && maxPrice !== null && minPrice > maxPrice)) {
    return c.json({ error: 'Invalid price filter' }, 400);
  }

  const allowedSorts = new Set(['newest', 'best_selling', 'price_asc', 'price_desc']);
  if (!allowedSorts.has(sort)) {
    return c.json({ error: 'Invalid product sort' }, 400);
  }

  let query = `
    SELECT p.id, p.category_id, p.name, p.slug, p.description, p.price, p.type, p.image_key, p.herosms_service, p.herosms_country,
      p.delivery_mode, p.validity_days, p.low_stock_threshold, p.is_featured, p.sort_order, p.is_active, p.created_at,
      c.name as category_name,
      (SELECT COUNT(*) FROM stock_codes sc WHERE sc.product_id = p.id
        AND COALESCE(sc.status, CASE WHEN sc.is_used = 0 THEN 'available' ELSE 'used' END) = 'available'
        AND (sc.expires_at IS NULL OR sc.expires_at > unixepoch())) as stock_count,
      COALESCE(sales.units_sold, 0) as sales_count
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN (
      SELECT oi.product_id, SUM(oi.quantity) as units_sold
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.payment_status = 'paid'
      GROUP BY oi.product_id
    ) sales ON sales.product_id = p.id
    WHERE p.is_active = 1
  `;
  const params: any[] = [];

  if (!includeAll && type !== 'herosms') {
    query += ` AND p.type != 'herosms'`;
  }
  if (type) {
    query += ` AND p.type = ?`;
    params.push(type);
  }
  if (categorySlug) {
    query += ` AND c.slug = ?`;
    params.push(categorySlug);
  }
  if (search) {
    query += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  if (service) {
    query += ` AND p.herosms_service = ?`;
    params.push(service);
  }
  if (country) {
    query += ` AND p.herosms_country = ?`;
    params.push(country);
  }
  if (minPrice !== null) {
    query += ` AND p.price >= ?`;
    params.push(minPrice);
  }
  if (maxPrice !== null) {
    query += ` AND p.price <= ?`;
    params.push(maxPrice);
  }
  if (instantOnly) {
    query += ` AND p.delivery_mode = 'instant'`;
  }
  if (inStock) {
    query += ` AND (p.type != 'code' OR (SELECT COUNT(*) FROM stock_codes sc2 WHERE sc2.product_id = p.id
      AND COALESCE(sc2.status, CASE WHEN sc2.is_used = 0 THEN 'available' ELSE 'used' END) = 'available'
      AND (sc2.expires_at IS NULL OR sc2.expires_at > unixepoch())) > 0)`;
  }

  const orderBy = {
    newest: 'p.sort_order DESC, p.created_at DESC',
    best_selling: 'sales_count DESC, p.sort_order DESC, p.created_at DESC',
    price_asc: 'p.price ASC, p.sort_order DESC, p.created_at DESC',
    price_desc: 'p.price DESC, p.sort_order DESC, p.created_at DESC'
  }[sort];
  // page/limit are normalized finite integers above, so interpolating them keeps
  // the no-filter query compatible with lightweight database adapters while
  // still keeping all user-controlled text parameterized.
  query += ` ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`;

  const stmt = c.env.DB.prepare(query);
  const res = await (params.length > 0 ? stmt.bind(...params) : stmt).all();
  const products = (res.results || []).map(formatPublicProduct);

  let countQuery = `
    SELECT COUNT(*) as total
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = 1
  `;
  const countParams: any[] = [];
  if (!includeAll && type !== 'herosms') countQuery += ` AND p.type != 'herosms'`;
  if (type) {
    countQuery += ` AND p.type = ?`;
    countParams.push(type);
  }
  if (categorySlug) {
    countQuery += ` AND c.slug = ?`;
    countParams.push(categorySlug);
  }
  if (search) {
    countQuery += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
    countParams.push(`%${search}%`, `%${search}%`);
  }
  if (service) {
    countQuery += ` AND p.herosms_service = ?`;
    countParams.push(service);
  }
  if (country) {
    countQuery += ` AND p.herosms_country = ?`;
    countParams.push(country);
  }
  if (minPrice !== null) {
    countQuery += ` AND p.price >= ?`;
    countParams.push(minPrice);
  }
  if (maxPrice !== null) {
    countQuery += ` AND p.price <= ?`;
    countParams.push(maxPrice);
  }
  if (instantOnly) countQuery += ` AND p.delivery_mode = 'instant'`;
  if (inStock) countQuery += ` AND (p.type != 'code' OR (SELECT COUNT(*) FROM stock_codes sc2 WHERE sc2.product_id = p.id
    AND COALESCE(sc2.status, CASE WHEN sc2.is_used = 0 THEN 'available' ELSE 'used' END) = 'available'
    AND (sc2.expires_at IS NULL OR sc2.expires_at > unixepoch())) > 0)`;

  const countStmt = c.env.DB.prepare(countQuery);
  const countBound = countParams.length > 0 ? countStmt.bind(...countParams) : countStmt;
  const countResult = typeof (countBound as any).first === 'function'
    ? await (countBound as any).first()
    : { total: products.length };
  const total = Number(countResult?.total || 0);

  return c.json({
    products,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrevious: page > 1
    },
    filters: { type: type || null, service: service || null, country: country || null, minPrice, maxPrice, inStock, instant: instantOnly, sort, search: search || null, category: categorySlug || null }
  });
});

// Public: Stream Product Artwork Inline (active products only)
productsRouter.get('/:slug/artwork', async (c) => {
  const slug = c.req.param('slug');
  const product = await c.env.DB.prepare(
    'SELECT image_key FROM products WHERE slug = ? AND is_active = 1'
  ).bind(slug).first<{ image_key: string | null }>();

  if (!product || !product.image_key) {
    return c.json({ error: 'Artwork not found' }, 404);
  }

  const object = await c.env.FILES_BUCKET.get(product.image_key);
  if (!object) {
    return c.json({ error: 'Artwork image not found in storage' }, 404);
  }

  const contentType = object.httpMetadata?.contentType || 'image/jpeg';
  return c.body(object.body, 200, {
    'Content-Type': contentType,
    'Content-Disposition': 'inline',
    'Cache-Control': 'public, max-age=86400',
  });
});

// Get Product Detail by Slug
productsRouter.get('/by-slug/:slug', async (c) => {
  const slug = c.req.param('slug');
  let product = await c.env.DB.prepare(`
    SELECT p.id, p.category_id, p.name, p.slug, p.description, p.price, p.type, p.image_key, p.herosms_service, p.herosms_country,
      p.delivery_mode, p.validity_days, p.low_stock_threshold, p.is_featured, p.sort_order, p.is_active, p.created_at,
      c.name as category_name,
      (SELECT COUNT(*) FROM stock_codes sc WHERE sc.product_id = p.id
        AND COALESCE(sc.status, CASE WHEN sc.is_used = 0 THEN 'available' ELSE 'used' END) = 'available'
        AND (sc.expires_at IS NULL OR sc.expires_at > unixepoch())) as stock_count,
      (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.payment_status = 'paid') as sales_count
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.slug = ? AND p.is_active = 1
  `).bind(slug).first();

  if (!product && slug === 'herosms-otp-configurator') {
    product = await c.env.DB.prepare(`
      SELECT p.id, p.category_id, p.name, p.slug, p.description, p.price, p.type, p.image_key, p.herosms_service, p.herosms_country,
        p.delivery_mode, p.validity_days, p.low_stock_threshold, p.is_featured, p.sort_order, p.is_active, p.created_at,
        c.name as category_name,
        (SELECT COUNT(*) FROM stock_codes sc WHERE sc.product_id = p.id
          AND COALESCE(sc.status, CASE WHEN sc.is_used = 0 THEN 'available' ELSE 'used' END) = 'available'
          AND (sc.expires_at IS NULL OR sc.expires_at > unixepoch())) as stock_count,
        (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.payment_status = 'paid') as sales_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.type = 'herosms' AND p.is_active = 1
      LIMIT 1
    `).first();
  }

  if (!product) return c.json({ error: 'Product not found' }, 404);
  return c.json({ product: formatPublicProduct(product) });
});

productsRouter.get('/by-id/:id/reviews', async (c) => {
  const productId = c.req.param('id');
  const result = await c.env.DB.prepare(`
    SELECT r.id, r.rating, r.title, r.body, r.verified_purchase, r.created_at,
      substr(u.email, 1, 2) || '***' as author
    FROM product_reviews r JOIN users u ON u.id = r.user_id
    WHERE r.product_id = ? AND r.status = 'approved'
    ORDER BY r.created_at DESC LIMIT 50
  `).bind(productId).all();
  const summary = await c.env.DB.prepare(`
    SELECT COUNT(*) as count, COALESCE(AVG(rating), 0) as average
    FROM product_reviews WHERE product_id = ? AND status = 'approved'
  `).bind(productId).first<any>();
  return c.json({ reviews: result.results || [], summary: { count: Number(summary?.count || 0), average: Math.round(Number(summary?.average || 0) * 10) / 10 } });
});

productsRouter.post('/by-id/:id/reviews', async (c) => {
  const sessionId = getCookie(c, 'session');
  const user = await getSessionUser(c.env.DB, sessionId || '');
  if (!user) return c.json({ error: 'Silakan masuk untuk menulis ulasan.' }, 401);

  const productId = c.req.param('id');
  const product = await c.env.DB.prepare('SELECT id FROM products WHERE id = ? AND is_active = 1').bind(productId).first();
  if (!product) return c.json({ error: 'Produk tidak ditemukan.' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const rating = Number(body.rating);
  const title = String(body.title || '').trim().slice(0, 100);
  const reviewBody = String(body.body || '').trim().slice(0, 1000);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || reviewBody.length < 10) {
    return c.json({ error: 'Rating 1-5 dan ulasan minimal 10 karakter wajib diisi.' }, 400);
  }
  const purchase = await c.env.DB.prepare(`
    SELECT oi.order_id FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = ? AND o.user_id = ? AND o.payment_status = 'paid' AND oi.fulfilment_status = 'fulfilled'
    ORDER BY o.created_at DESC LIMIT 1
  `).bind(productId, user.id).first<{ order_id: string }>();
  if (!purchase) return c.json({ error: 'Ulasan hanya tersedia setelah pembelian berhasil dikirim.' }, 403);
  const duplicate = await c.env.DB.prepare('SELECT id FROM product_reviews WHERE product_id = ? AND user_id = ? AND order_id = ?').bind(productId, user.id, purchase.order_id).first();
  if (duplicate) return c.json({ error: 'Anda sudah mengulas produk ini untuk order tersebut.' }, 409);
  const reviewId = `rev_${crypto.randomUUID()}`;
  await c.env.DB.prepare(`
    INSERT INTO product_reviews (id, product_id, user_id, order_id, rating, title, body, status, verified_purchase)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', 1)
  `).bind(reviewId, productId, user.id, purchase.order_id, rating, title || null, reviewBody).run();
  return c.json({ success: true, reviewId }, 201);
});

// Admin: Create Product
productsRouter.post('/admin', requireAdmin, async (c) => {
  const body = await c.req.json();
  const { category_id, name, slug, description, price, type, r2_key, image_key, herosms_service, herosms_country,
    delivery_mode, validity_days, low_stock_threshold, is_featured, sort_order } = body;

  if (!name || !slug || price === undefined || !type) {
    return c.json({ error: 'Name, slug, price, and type are required' }, 400);
  }

  const validTypes = ['file', 'code', 'herosms'];
  if (!validTypes.includes(type)) {
    return c.json({ error: 'Invalid product type. Must be file, code, or herosms' }, 400);
  }

  const numPrice = Number(price);
  if (!Number.isFinite(numPrice) || numPrice <= 0) {
    return c.json({ error: 'Price must be a positive finite number' }, 400);
  }

  const normalizedDeliveryMode = delivery_mode === undefined ? 'instant' : String(delivery_mode);
  if (!['instant', 'manual'].includes(normalizedDeliveryMode)) {
    return c.json({ error: 'Invalid delivery mode. Must be instant or manual' }, 400);
  }
  const normalizedValidityDays = validity_days === null || validity_days === undefined || validity_days === ''
    ? null : Number(validity_days);
  const normalizedLowStockThreshold = low_stock_threshold === undefined || low_stock_threshold === ''
    ? 5 : Number(low_stock_threshold);
  const normalizedSortOrder = sort_order === undefined || sort_order === '' ? 0 : Number(sort_order);
  if ((normalizedValidityDays !== null && (!Number.isInteger(normalizedValidityDays) || normalizedValidityDays < 1)) ||
      (!Number.isInteger(normalizedLowStockThreshold) || normalizedLowStockThreshold < 0) ||
      (!Number.isInteger(normalizedSortOrder))) {
    return c.json({ error: 'Invalid product catalog metadata' }, 400);
  }
  const normalizedFeatured = is_featured === true || is_featured === 1 ? 1 : 0;

  const id = `prd_${crypto.randomUUID()}`;
  await c.env.DB.prepare(`
    INSERT INTO products (id, category_id, name, slug, description, price, type, r2_key, image_key, herosms_service, herosms_country,
      delivery_mode, validity_days, low_stock_threshold, is_featured, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, category_id || null, name, slug.toLowerCase(), description || '', numPrice, type, r2_key || null, image_key || null,
    herosms_service || null, herosms_country || null, normalizedDeliveryMode, normalizedValidityDays,
    normalizedLowStockThreshold, normalizedFeatured, normalizedSortOrder
  ).run();

  return c.json({ success: true, id });
});

// Admin: Edit Product
productsRouter.put('/admin/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { category_id, name, slug, description, price, type, r2_key, image_key, herosms_service, herosms_country, is_active,
    delivery_mode, validity_days, low_stock_threshold, is_featured, sort_order } = body;

  const validTypes = ['file', 'code', 'herosms'];
  if (type && !validTypes.includes(type)) {
    return c.json({ error: 'Invalid product type' }, 400);
  }

  let numPrice = price;
  if (price !== undefined) {
    numPrice = Number(price);
    if (!Number.isFinite(numPrice) || numPrice <= 0) {
      return c.json({ error: 'Price must be a positive finite number' }, 400);
    }
  }

  const normalizedDeliveryMode = delivery_mode === undefined ? 'instant' : String(delivery_mode);
  if (!['instant', 'manual'].includes(normalizedDeliveryMode)) {
    return c.json({ error: 'Invalid delivery mode' }, 400);
  }
  const normalizedValidityDays = validity_days === null || validity_days === undefined || validity_days === ''
    ? null : Number(validity_days);
  const normalizedLowStockThreshold = low_stock_threshold === undefined || low_stock_threshold === ''
    ? 5 : Number(low_stock_threshold);
  const normalizedSortOrder = sort_order === undefined || sort_order === '' ? 0 : Number(sort_order);
  if ((normalizedValidityDays !== null && (!Number.isInteger(normalizedValidityDays) || normalizedValidityDays < 1)) ||
      (!Number.isInteger(normalizedLowStockThreshold) || normalizedLowStockThreshold < 0) ||
      (!Number.isInteger(normalizedSortOrder))) {
    return c.json({ error: 'Invalid product catalog metadata' }, 400);
  }
  const normalizedFeatured = is_featured === true || is_featured === 1 ? 1 : 0;

  await c.env.DB.prepare(`
    UPDATE products SET
      category_id = ?, name = ?, slug = ?, description = ?, price = ?, type = ?,
      r2_key = ?, image_key = COALESCE(?, image_key), herosms_service = ?, herosms_country = ?,
      delivery_mode = ?, validity_days = ?, low_stock_threshold = ?, is_featured = ?, sort_order = ?, is_active = ?
    WHERE id = ?
  `).bind(
    category_id || null, name, slug, description, numPrice, type,
    r2_key || null, image_key || null, herosms_service || null, herosms_country || null,
    normalizedDeliveryMode, normalizedValidityDays, normalizedLowStockThreshold, normalizedFeatured, normalizedSortOrder,
    is_active ?? 1, id
  ).run();

  return c.json({ success: true });
});

// Admin: Upload Product Artwork (JPEG, PNG, WebP, AVIF up to 2 MiB under product-artwork/)
productsRouter.post('/admin/:id/artwork', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const product = await c.env.DB.prepare('SELECT id, slug FROM products WHERE id = ?').bind(id).first<{ id: string; slug: string }>();
  if (!product) {
    return c.json({ error: 'Product not found' }, 404);
  }

  let formData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'Invalid form data' }, 400);
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return c.json({ error: 'No artwork file uploaded' }, 400);
  }

  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];
  if (!validTypes.includes(file.type.toLowerCase())) {
    return c.json({ error: 'Invalid file type. Allowed formats: JPEG, PNG, WebP, AVIF' }, 400);
  }

  const MAX_SIZE = 2 * 1024 * 1024; // 2 MiB
  if (file.size > MAX_SIZE) {
    return c.json({ error: 'File size exceeds 2 MiB limit' }, 400);
  }

  const ext = file.name.split('.').pop() || 'jpg';
  const imageKey = `product-artwork/${id}_${Date.now()}.${ext}`;
  const buffer = await file.arrayBuffer();

  await c.env.FILES_BUCKET.put(imageKey, buffer, {
    httpMetadata: { contentType: file.type }
  });

  await c.env.DB.prepare('UPDATE products SET image_key = ? WHERE id = ?').bind(imageKey, id).run();

  return c.json({
    success: true,
    artwork_url: `/api/products/${product.slug}/artwork`,
  });
});

// Admin: Upload Stock Codes in Bulk (max 500 items)
productsRouter.post('/admin/stock', requireAdmin, async (c) => {
  const { product_id, codes } = await c.req.json();
  if (!product_id || !Array.isArray(codes) || codes.length === 0) {
    return c.json({ error: 'product_id and array of codes required' }, 400);
  }

  if (codes.length > 500) {
    return c.json({ error: 'Maksimal 500 kode per batch' }, 400);
  }

  const cleanCodes = codes.map((code: any) => String(code).trim()).filter(Boolean);
  if (cleanCodes.length === 0) {
    return c.json({ error: 'No valid codes provided' }, 400);
  }

  const product = await c.env.DB.prepare('SELECT id, type FROM products WHERE id = ? AND is_active = 1')
    .bind(product_id).first<{ id: string; type: string }>();
  if (!product || product.type !== 'code') {
    return c.json({ error: 'Stok hanya dapat ditambahkan ke produk kode yang aktif.' }, 400);
  }

  const uniqueCodes = Array.from(new Set(cleanCodes));
  const placeholders = uniqueCodes.map(() => '?').join(', ');
  const existingResult = await c.env.DB.prepare(
    `SELECT code FROM stock_codes WHERE product_id = ? AND code IN (${placeholders})`
  ).bind(product_id, ...uniqueCodes).all<{ code: string }>();
  const existingCodes = new Set((existingResult.results || []).map((row) => row.code));
  const newCodes = uniqueCodes.filter((code) => !existingCodes.has(code));
  if (newCodes.length === 0) {
    return c.json({ success: true, added: 0, skipped: uniqueCodes.length, message: 'Semua kode sudah ada di stok.' });
  }

  const stmt = c.env.DB.prepare(
    'INSERT INTO stock_codes (id, product_id, code) VALUES (?, ?, ?)'
  );

  const batch = newCodes.map((code: string) => stmt.bind(`stk_${crypto.randomUUID()}`, product_id, code));
  await c.env.DB.batch(batch);

  return c.json({ success: true, added: newCodes.length, skipped: uniqueCodes.length - newCodes.length });
});

// Admin: Upload File to R2 (Private digital download file, max 50MB, sanitized filename, safe MIME allowlist)
productsRouter.post('/admin/upload-file', requireAdmin, async (c) => {
  let formData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'Invalid form data' }, 400);
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return c.json({ error: 'No file uploaded' }, 400);
  }

  const MAX_SIZE = 50 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return c.json({ error: 'File size exceeds 50MB limit' }, 400);
  }

  const ALLOWED_MIME_TYPES = new Set([
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/vnd.rar',
    'application/x-7z-compressed',
    'application/gzip',
    'application/x-tar',
    'application/pdf',
    'application/epub+zip',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]);

  const ALLOWED_EXTENSIONS = new Set([
    'zip', 'rar', '7z', 'gz', 'tar', 'pdf', 'epub', 'txt', 'png', 'jpg', 'jpeg', 'webp'
  ]);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = safeName.split('.').pop()?.toLowerCase() || '';

  const fileMime = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(fileMime) || !ALLOWED_EXTENSIONS.has(ext)) {
    return c.json({
      error: 'Tipe file tidak diizinkan. Format yang didukung: ZIP, RAR, 7Z, TAR, GZ, PDF, EPUB, TXT, JPG, PNG, WebP.'
    }, 400);
  }

  const key = `files/${crypto.randomUUID()}-${safeName}`;
  const buffer = await file.arrayBuffer();

  await c.env.FILES_BUCKET.put(key, buffer, {
    httpMetadata: { contentType: file.type }
  });

  return c.json({ success: true, r2_key: key, filename: safeName });
});
