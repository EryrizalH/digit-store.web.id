// ponytail: Products & Catalog router with stock calculation and R2 file uploads
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

// Get Categories
productsRouter.get('/categories', async (c) => {
  const res = await c.env.DB.prepare('SELECT * FROM categories ORDER BY name ASC').all();
  return c.json({ categories: res.results || [] });
});

// List Products (Public Catalog)
productsRouter.get('/', async (c) => {
  const categorySlug = c.req.query('category');
  const search = c.req.query('q');

  let query = `
    SELECT p.*, c.name as category_name,
      (SELECT COUNT(*) FROM stock_codes sc WHERE sc.product_id = p.id AND sc.is_used = 0) as stock_count
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = 1
  `;
  const params: any[] = [];

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
  return c.json({ products: res.results || [] });
});

// Get Product Detail by Slug
productsRouter.get('/by-slug/:slug', async (c) => {
  const slug = c.req.param('slug');
  const product = await c.env.DB.prepare(`
    SELECT p.*, c.name as category_name,
      (SELECT COUNT(*) FROM stock_codes sc WHERE sc.product_id = p.id AND sc.is_used = 0) as stock_count
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.slug = ? AND p.is_active = 1
  `).bind(slug).first();

  if (!product) return c.json({ error: 'Product not found' }, 404);
  return c.json({ product });
});

// Admin: Create Product
productsRouter.post('/admin', requireAdmin, async (c) => {
  const body = await c.req.json();
  const { category_id, name, slug, description, price, type, r2_key, herosms_service, herosms_country } = body;

  if (!name || !slug || !price || !type) {
    return c.json({ error: 'Name, slug, price, and type are required' }, 400);
  }

  const id = `prd_${crypto.randomUUID()}`;
  await c.env.DB.prepare(`
    INSERT INTO products (id, category_id, name, slug, description, price, type, r2_key, herosms_service, herosms_country)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, category_id || null, name, slug.toLowerCase(), description || '', price, type, r2_key || null, herosms_service || null, herosms_country || null
  ).run();

  return c.json({ success: true, id });
});

// Admin: Edit Product
productsRouter.put('/admin/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { category_id, name, slug, description, price, type, r2_key, herosms_service, herosms_country, is_active } = body;

  await c.env.DB.prepare(`
    UPDATE products SET
      category_id = ?, name = ?, slug = ?, description = ?, price = ?, type = ?,
      r2_key = ?, herosms_service = ?, herosms_country = ?, is_active = ?
    WHERE id = ?
  `).bind(
    category_id || null, name, slug, description, price, type,
    r2_key || null, herosms_service || null, herosms_country || null, is_active ?? 1, id
  ).run();

  return c.json({ success: true });
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

// Admin: Upload File to R2
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
