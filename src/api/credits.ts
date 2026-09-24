import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { Env, User } from '../types';
import { getSessionUser } from '../services/auth';
import { getBalance } from '../services/credits';
import { getPaymentGateway, QrisGateway } from '../services/payments';

export const creditsRouter = new Hono<{ Bindings: Env; Variables: { user?: User } }>();

// Auth middleware helper
async function getAuthUser(c: any): Promise<User | null> {
  const sessionId = getCookie(c, 'session');
  if (!sessionId) return null;
  return getSessionUser(c.env.DB, sessionId);
}

const QRIS_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Reconcile a pending topup against the QRIS gateway. QRIS expiry callbacks
 * are best-effort, so the status endpoint must also be able to close an old
 * pending topup when the gateway reports EXPIRED (or complete it if the paid
 * callback was lost).
 */
async function reconcilePendingTopup(db: D1Database, env: Env, txn: any): Promise<{ status: 'pending' | 'paid' | 'failed'; txn: any | null }> {
  if (!txn || txn.type !== 'topup_pending') return { status: txn?.type === 'topup' ? 'paid' : 'failed', txn };

  const createdAt = Date.parse(String(txn.created_at || ''));
  if (!Number.isFinite(createdAt) || Date.now() - createdAt < QRIS_EXPIRY_MS) {
    return { status: 'pending', txn };
  }

  const match = typeof txn.description === 'string' ? txn.description.match(/QRIS \(([^)]+)\)/) : null;
  if (!match?.[1]) return { status: 'pending', txn };

  try {
    const gateway = getPaymentGateway('qris', env) as QrisGateway;
    const gatewayStatus = await gateway.fetchStatus(match[1]);
    if (gatewayStatus.status === 'EXPIRED' || gatewayStatus.status === 'FAILED') {
      await db.prepare(
        "DELETE FROM credit_transactions WHERE id = ? AND type = 'topup_pending'"
      ).bind(txn.id).run();
      return { status: 'failed', txn: null };
    }
    if (gatewayStatus.status !== 'PAID') return { status: 'pending', txn };

    const expectedAmount = Math.round(Number(txn.amount));
    const paidAmount = Math.round(Number(gatewayStatus.amount));
    if (!Number.isFinite(paidAmount) || expectedAmount !== paidAmount) {
      console.error(`QRIS topup status amount mismatch for ${txn.reference_id}`);
      return { status: 'pending', txn };
    }

    const results = await db.batch([
      db.prepare(
        "UPDATE credit_transactions SET type = 'topup', description = ? WHERE id = ? AND type = 'topup_pending'"
      ).bind(`Topup completed via QRIS (${match[1]})`, txn.id),
      db.prepare(`
        INSERT INTO user_credits (user_id, balance, updated_at)
        SELECT ?, ?, CURRENT_TIMESTAMP
        WHERE (SELECT changes()) > 0
        ON CONFLICT(user_id) DO UPDATE SET balance = balance + excluded.balance, updated_at = CURRENT_TIMESTAMP
      `).bind(txn.user_id, txn.amount),
      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, details)
        SELECT ?, ?, ?, ?
        WHERE (SELECT changes()) > 0
      `).bind(`log_${crypto.randomUUID()}`, txn.user_id, 'CREDIT_TOPUP_COMPLETED', `Topup ${txn.reference_id} credited IDR ${txn.amount} via QRIS`)
    ]);
    const changes = Number(results?.[0]?.meta?.changes ?? (results?.[0] as any)?.changes ?? 0);
    if (changes > 0) return { status: 'paid', txn: { ...txn, type: 'topup' } };

    const latest = await db.prepare(
      'SELECT * FROM credit_transactions WHERE reference_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(txn.reference_id, txn.user_id).first<any>();
    return { status: latest?.type === 'topup' ? 'paid' : 'pending', txn: latest || txn };
  } catch (error) {
    console.error('Failed to reconcile QRIS topup:', error);
    return { status: 'pending', txn };
  }
}

// GET /balance - returns user credit balance
creditsRouter.get('/balance', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Authentication required' }, 401);

  const balance = await getBalance(c.env.DB, user.id);
  return c.json({ balance });
});

// POST /topup creates a QRIS payment and a pending credit ledger row
creditsRouter.post('/topup', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Authentication required' }, 401);

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }
  const { amount } = body || {};
  const topupAmount = Math.round(Number(amount));

  if (!Number.isFinite(topupAmount) || topupAmount < 10000) {
    return c.json({ error: 'Minimum topup amount is IDR 10,000' }, 400);
  }

  if (topupAmount > 5000000) {
    return c.json({ error: 'Maximum topup amount is IDR 5,000,000' }, 400);
  }

  const topupId = `TOPUP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const appUrl = c.env.APP_URL || '';

  // Persist the pending claim before contacting the gateway. A fast webhook
  // must always find a row to claim, otherwise a successful payment could be
  // acknowledged without crediting the wallet.
  const pendingTxnId = `crtx_${crypto.randomUUID()}`;
  await c.env.DB.prepare(`
    INSERT INTO credit_transactions (id, user_id, type, amount, reference_id, description, created_at)
    VALUES (?, ?, 'topup_pending', ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(pendingTxnId, user.id, topupAmount, topupId, 'Pending topup via QRIS').run();

  const gateway = getPaymentGateway('qris', c.env);
  let result;
  try {
    result = await gateway.createTransaction({
      orderId: topupId,
      amount: topupAmount,
      customerEmail: user.email,
      items: [{ id: 'credit-topup', name: 'Credit Topup', price: topupAmount, quantity: 1 }],
      successReturnUrl: `${appUrl}/topup/success`,
      cancelReturnUrl: `${appUrl}/topup/cancel`
    });
  } catch (err: any) {
    console.error('Failed to initiate credit topup:', err);
    await c.env.DB.prepare(
      "DELETE FROM credit_transactions WHERE id = ? AND type = 'topup_pending'"
    ).bind(pendingTxnId).run();
    return c.json({
      error: `Gagal membuat pembayaran topup: ${err.message || 'Gateway error'}`,
      code: 'PAYMENT_GATEWAY_ERROR'
    }, 502);
  }

  await c.env.DB.prepare(
    "UPDATE credit_transactions SET description = ? WHERE id = ? AND type = 'topup_pending'"
  ).bind(`Pending topup via QRIS (${result.paymentId})`, pendingTxnId).run();

  // Audit log
  await c.env.DB.prepare(`
    INSERT INTO audit_logs (id, user_id, action, details)
    VALUES (?, ?, ?, ?)
  `).bind(`log_${crypto.randomUUID()}`, user.id, 'CREDIT_TOPUP_INITIATED', `Topup ${topupId} for IDR ${topupAmount}`).run();

  return c.json({
    success: true,
    topupId,
    redirectUrl: result.redirectUrl,
    paymentId: result.paymentId,
    qrString: result.qrString || null,
    qrImageUrl: `/api/credits/topup/${topupId}/qr`,
    expiresAt: result.expiresAt || null,
    amount: topupAmount
  });
});

// Proxy QR image for Topup transactions
creditsRouter.get('/topup/:id/qr', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Authentication required' }, 401);

  const topupId = c.req.param('id');
  const txn = await c.env.DB.prepare(
    'SELECT * FROM credit_transactions WHERE reference_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(topupId, user.id).first<any>();

  if (!txn) return c.json({ error: 'Topup transaction not found' }, 404);

  const match = typeof txn.description === 'string' ? txn.description.match(/QRIS \(([^)]+)\)/) : null;
  const paymentId = match ? match[1] : null;
  if (!paymentId) return c.json({ error: 'Payment identifier not found' }, 404);

  const gateway = getPaymentGateway('qris', c.env) as QrisGateway;
  try {
    const qrRes = await gateway.fetchQrImage(paymentId);
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

// Real-time status check for Topup
creditsRouter.get('/topup/:id/status', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Authentication required' }, 401);

  const topupId = c.req.param('id');
  const txn = await c.env.DB.prepare(
    'SELECT * FROM credit_transactions WHERE reference_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(topupId, user.id).first<any>();

  if (!txn) return c.json({ error: 'Topup transaction not found' }, 404);

  const reconciled = await reconcilePendingTopup(c.env.DB, c.env, txn);

  const balance = await getBalance(c.env.DB, user.id);
  return c.json({
    topupId,
    status: reconciled.status,
    amount: reconciled.txn?.amount ?? txn.amount,
    balance
  });
});

// GET /history - paginated credit transaction history
creditsRouter.get('/history', async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: 'Authentication required' }, 401);

  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  // Filter out topup_pending transactions from history (they are not yet confirmed)
  const transactions = await c.env.DB.prepare(`
    SELECT * FROM credit_transactions WHERE user_id = ? AND type != 'topup_pending' ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).bind(user.id, limit, offset).all();

  const countResult = await c.env.DB.prepare(
    "SELECT COUNT(*) as total FROM credit_transactions WHERE user_id = ? AND type != 'topup_pending'"
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
