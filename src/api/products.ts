// ponytail: Products & Catalog router with stock calculation, artwork streaming, and R2 uploads
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

// ponytail: Explicit allowlist projection for public responses — excludes r2_key and image_key
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
    is_active: p.is_active,
    created_at: p.created_at,
    category_name: p.category_name,
    stock_count: p.stock_count,
    artwork_url: p.image_key ? `/api/products/${p.slug}/artwork` : null,
  };
}

// Get Categories
productsRouter.get('/categories', async (c) => {
  const res = await c.env.DB.prepare('SELECT id, name, slug FROM categories ORDER BY name ASC').all();
  return c.json({ categories: res.results || [] });
});

// List Products (Public Catalog)
productsRouter.get('/', async (c) => {
  const categorySlug = c.req.query('category');
  const search = c.req.query('q');
  const includeAll = c.req.query('include_all') === '1';

  let query = `
    SELECT p.id, p.category_id, p.name, p.slug, p.description, p.price, p.type, p.image_key, p.herosms_service, p.herosms_country, p.is_active, p.created_at,
      c.name as category_name,
      (SELECT COUNT(*) FROM stock_codes sc WHERE sc.product_id = p.id AND sc.is_used = 0) as stock_count
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = 1
  `;
  const params: any[] = [];

  if (!includeAll) {
    query += ` AND p.type != 'herosms'`;
  }
  if (categorySlug) {
    query += ` AND c.slug = ?`;
    params.push(categorySlug);
  }
  if (search) {
    query += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY p.created_at DESC`;

  const stmt = c.env.DB.prepare(query);
  const res = await (params.length > 0 ? stmt.bind(...params) : stmt).all();
  const products = (res.results || []).map(formatPublicProduct);
  return c.json({ products });
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
    SELECT p.id, p.category_id, p.name, p.slug, p.description, p.price, p.type, p.image_key, p.herosms_service, p.herosms_country, p.is_active, p.created_at,
      c.name as category_name,
      (SELECT COUNT(*) FROM stock_codes sc WHERE sc.product_id = p.id AND sc.is_used = 0) as stock_count
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.slug = ? AND p.is_active = 1
  `).bind(slug).first();

  if (!product && slug === 'herosms-otp-configurator') {
    product = await c.env.DB.prepare(`
      SELECT p.id, p.category_id, p.name, p.slug, p.description, p.price, p.type, p.image_key, p.herosms_service, p.herosms_country, p.is_active, p.created_at,
        c.name as category_name,
        (SELECT COUNT(*) FROM stock_codes sc WHERE sc.product_id = p.id AND sc.is_used = 0) as stock_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.type = 'herosms' AND p.is_active = 1
      LIMIT 1
    `).first();
  }

  if (!product) return c.json({ error: 'Product not found' }, 404);
  return c.json({ product: formatPublicProduct(product) });
});

// Admin: Create Product
productsRouter.post('/admin', requireAdmin, async (c) => {
  const body = await c.req.json();
  const { category_id, name, slug, description, price, type, r2_key, image_key, herosms_service, herosms_country } = body;

  if (!name || !slug || !price || !type) {
    return c.json({ error: 'Name, slug, price, and type are required' }, 400);
  }

  const id = `prd_${crypto.randomUUID()}`;
  await c.env.DB.prepare(`
    INSERT INTO products (id, category_id, name, slug, description, price, type, r2_key, image_key, herosms_service, herosms_country)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, category_id || null, name, slug.toLowerCase(), description || '', price, type, r2_key || null, image_key || null, herosms_service || null, herosms_country || null
  ).run();

  return c.json({ success: true, id });
});

// Admin: Edit Product
productsRouter.put('/admin/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { category_id, name, slug, description, price, type, r2_key, image_key, herosms_service, herosms_country, is_active } = body;

  await c.env.DB.prepare(`
    UPDATE products SET
      category_id = ?, name = ?, slug = ?, description = ?, price = ?, type = ?,
      r2_key = ?, image_key = COALESCE(?, image_key), herosms_service = ?, herosms_country = ?, is_active = ?
    WHERE id = ?
  `).bind(
    category_id || null, name, slug, description, price, type,
    r2_key || null, image_key || null, herosms_service || null, herosms_country || null, is_active ?? 1, id
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

// Admin: Upload Stock Codes in Bulk
productsRouter.post('/admin/stock', requireAdmin, async (c) => {
  const { product_id, codes } = await c.req.json();
  if (!product_id || !Array.isArray(codes) || codes.length === 0) {
    return c.json({ error: 'product_id and array of codes required' }, 400);
  }

  const stmt = c.env.DB.prepare(
    'INSERT INTO stock_codes (id, product_id, code) VALUES (?, ?, ?)'
  );

  const batch = codes.map((code: string) => stmt.bind(`stk_${crypto.randomUUID()}`, product_id, code.trim()));
  await c.env.DB.batch(batch);

  return c.json({ success: true, added: codes.length });
});

// Admin: Upload File to R2 (Private digital download file)
productsRouter.post('/admin/upload-file', requireAdmin, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;
  if (!file) {
    return c.json({ error: 'No file uploaded' }, 400);
  }

  const key = `files/${crypto.randomUUID()}-${file.name}`;
  const buffer = await file.arrayBuffer();

  await c.env.FILES_BUCKET.put(key, buffer, {
    httpMetadata: { contentType: file.type }
  });

  return c.json({ success: true, r2_key: key, filename: file.name });
});
