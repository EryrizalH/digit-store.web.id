// ponytail: Credits API router for balance check, topup via Sumopod, and transaction history
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { Env, User } from '../types';
import { getSessionUser } from '../services/auth';
import { getBalance } from '../services/credits';
import { getPaymentGateway } from '../services/payments';

export const creditsRouter = new Hono<{ Bindings: Env; Variables: { user?: User } }>();

// Auth middleware helper
async function getAuthUser(c: any): Promise<User | null> {
  const sessionId = getCookie(c, 'session');
  if (!sessionId) return null;
  return getSessionUser(c.env.DB, sessionId);
}

// GET /balance - returns user credit balance
creditsRouter.get('/balance', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Authentication required' }, 401);

  const balance = await getBalance(c.env.DB, user.id);
  return c.json({ balance });
});

// POST /topup - create a topup payment via Sumopod
creditsRouter.post('/topup', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Authentication required' }, 401);

  const { amount } = await c.req.json();
  const topupAmount = Number(amount);

  if (!topupAmount || topupAmount < 10000) {
    return c.json({ error: 'Minimum topup amount is IDR 10,000' }, 400);
  }

  const topupId = `TOPUP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const appUrl = c.env.APP_URL || '';

  const gateway = getPaymentGateway('sumopod', c.env);
  const result = await gateway.createTransaction({
    orderId: topupId,
    amount: topupAmount,
    customerEmail: user.email,
    items: [{ id: 'credit-topup', name: 'Credit Topup', price: topupAmount, quantity: 1 }],
    successReturnUrl: `${appUrl}/topup/success`,
    cancelReturnUrl: `${appUrl}/topup/cancel`
  });

  // Store a pending topup record in credit_transactions for tracking
  await c.env.DB.prepare(`
    INSERT INTO credit_transactions (id, user_id, type, amount, reference_id, description, created_at)
    VALUES (?, ?, 'topup', ?, ?, 'Pending topup via Sumopod', CURRENT_TIMESTAMP)
  `).bind(`crtx_${crypto.randomUUID()}`, user.id, topupAmount, topupId).run();

  // Audit log
  await c.env.DB.prepare(`
    INSERT INTO audit_logs (id, user_id, action, details)
    VALUES (?, ?, ?, ?)
  `).bind(`log_${crypto.randomUUID()}`, user.id, 'CREDIT_TOPUP_INITIATED', `Topup ${topupId} for IDR ${topupAmount}`).run();

  return c.json({
    success: true,
    topupId,
    redirectUrl: result.redirectUrl,
    paymentId: result.paymentId
  });
});

// GET /history - paginated credit transaction history
creditsRouter.get('/history', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Authentication required' }, 401);

  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  const transactions = await c.env.DB.prepare(`
    SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).bind(user.id, limit, offset).all();

  const countResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as total FROM credit_transactions WHERE user_id = ?'
  ).bind(user.id).first<{ total: number }>();

  return c.json({
    transactions: transactions.results || [],
    pagination: {
      page,
      limit,
      total: countResult?.total || 0,
      totalPages: Math.ceil((countResult?.total || 0) / limit)
    }
  });
});
