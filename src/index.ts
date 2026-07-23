// ponytail: Main Cloudflare Worker entry point with Hono API routing & SPA asset fallback
import { Hono } from 'hono';
import { Env } from './types';
import { authRouter } from './api/auth';
import { productsRouter } from './api/products';
import { ordersRouter } from './api/orders';
import { downloadsRouter } from './api/downloads';
import { activationsRouter } from './api/activations';
import { webhooksRouter } from './api/webhooks';
import { otpRouter } from './api/otp';

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

api.get('/health', (c) => c.json({
  status: 'ok',
  time: new Date().toISOString(),
  limits: {
    workerRequests: '100,000 / day (Workers Free)',
    d1RowsRead: '5,000,000 / day',
    r2Bandwidth: '10 GB / month'
  }
}));

app.route('/api', api);

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
