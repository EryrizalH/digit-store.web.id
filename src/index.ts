import { Hono } from 'hono';
import { Env } from './types';
import { authRouter } from './api/auth';
import { productsRouter } from './api/products';
import { ordersRouter } from './api/orders';
import { downloadsRouter } from './api/downloads';
import { activationsRouter } from './api/activations';
import { webhooksRouter } from './api/webhooks';
import { otpRouter } from './api/otp';
import { creditsRouter } from './api/credits';
import { notificationsRouter } from './api/notifications';

const app = new Hono<{ Bindings: Env }>();

// API routes
const api = new Hono<{ Bindings: Env }>();
api.route('/auth', authRouter);
api.route('/products', productsRouter);
api.route('/orders', ordersRouter);
api.route('/downloads', downloadsRouter);
api.route('/activations', activationsRouter);
api.route('/webhooks', webhooksRouter);
api.route('/otp', otpRouter);
api.route('/credits', creditsRouter);
api.route('/notifications', notificationsRouter);

api.get('/health', (c) => c.json({
  status: 'ok',
  time: new Date().toISOString()
}));

// Fallback JSON 404 for unmatched API routes
api.all('*', (c) => c.json({ error: 'API route not found' }, 404));

app.route('/api', api);

function xmlEscape(value: string): string {
  return value.replace(/[<>&'\"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char] || char));
}

app.get('/sitemap.xml', async (c) => {
  const baseUrl = (c.env.APP_URL || new URL(c.req.url).origin).replace(/\/$/, '');
  // ponytail: products schema defines created_at (not updated_at)
  const products = await c.env.DB.prepare("SELECT slug, created_at FROM products WHERE is_active = 1 AND type != 'herosms' ORDER BY created_at DESC").all<{ slug: string; created_at?: string }>();
  const urls = [
    `${baseUrl}/`,
    `${baseUrl}/bantuan`,
    ...(products.results || []).map((product) => `${baseUrl}/produk/${encodeURIComponent(product.slug)}`)
  ];
  const body = urls.map((url) => `  <url><loc>${xmlEscape(url)}</loc></url>`).join('\n');
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`, 200, { 'Content-Type': 'application/xml; charset=UTF-8', 'Cache-Control': 'public, max-age=3600' });
});

app.get('/robots.txt', (c) => {
  const baseUrl = (c.env.APP_URL || new URL(c.req.url).origin).replace(/\/$/, '');
  return c.text(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${baseUrl}/sitemap.xml\n`, 200, { 'Content-Type': 'text/plain; charset=UTF-8' });
});

// SPA Asset Fallback
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    try {
      const res = await c.env.ASSETS.fetch(c.req.raw);
      if (res.status !== 404) return res;

      // Fallback to index.html for SPA routes
      const indexReq = new Request(new URL('/index.html', c.req.url).toString(), c.req.raw);
      return await c.env.ASSETS.fetch(indexReq);
    } catch {
      // Fallback if ASSETS binding fails
    }
  }
  return c.text('Digital Store API Server Running', 200);
});

export default app;
