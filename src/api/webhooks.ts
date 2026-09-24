import { Hono } from 'hono';
import { Env } from '../types';
import { getPaymentGateway } from '../services/payments';
import { fulfillOrder } from '../services/fulfilment';
import { timingSafeEqual } from '../services/auth';
import { createInAppNotification, sendNotificationWebhook } from '../services/notifications';

export const webhooksRouter = new Hono<{ Bindings: Env }>();

/**
 * Complete a pending wallet topup as one D1 transaction. The first statement
 * claims the pending ledger row; the following statements use SQLite's
 * changes() value so a duplicate callback cannot credit the wallet twice.
 */
async function completeTopup(
  db: D1Database,
  topupTxn: { user_id: string; amount: number; reference_id: string },
  description: string,
  auditDetails: string
): Promise<boolean> {
  if (!Number.isSafeInteger(Number(topupTxn.amount)) || Number(topupTxn.amount) <= 0) {
    throw new Error('Invalid topup amount');
  }
  const results = await db.batch([
    db.prepare(
      "UPDATE credit_transactions SET type = 'topup', description = ? WHERE reference_id = ? AND type = 'topup_pending'"
    ).bind(description, topupTxn.reference_id),
    db.prepare(`
      INSERT INTO user_credits (user_id, balance, updated_at)
      SELECT ?, ?, CURRENT_TIMESTAMP
      WHERE (SELECT changes()) > 0
      ON CONFLICT(user_id) DO UPDATE SET balance = balance + excluded.balance, updated_at = CURRENT_TIMESTAMP
    `).bind(topupTxn.user_id, topupTxn.amount),
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, details)
      SELECT ?, ?, ?, ?
      WHERE (SELECT changes()) > 0
    `).bind(`log_${crypto.randomUUID()}`, topupTxn.user_id, 'CREDIT_TOPUP_COMPLETED', auditDetails)
  ]);

  const changes = results?.[0]?.meta?.changes ?? (results?.[0] as any)?.changes ?? 0;
  return Number(changes) > 0;
}

// Midtrans Webhook Callback
webhooksRouter.post('/midtrans', async (c) => {
  let payload: any;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'Malformed JSON payload' }, 400);
  }
  const headers = Object.fromEntries(c.req.raw.headers.entries());

  try {
    const gateway = getPaymentGateway('midtrans', c.env);
    const { orderId, status, grossAmount } = await gateway.verifyWebhook(payload, headers);

    const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<any>();
    if (!order) {
      return c.json({ error: 'Order not found' }, 404);
    }

    // Provider check
    if (order.payment_provider !== 'midtrans') {
      return c.json({ error: 'Payment provider mismatch' }, 400);
    }

    // Amount check
    const expectedAmount = Math.round(Number(order.total_amount));
    const paidAmount = Math.round(Number(grossAmount ?? payload.gross_amount));
    if (expectedAmount !== paidAmount) {
      return c.json({ error: 'Payment amount mismatch' }, 400);
    }

    // Monotonic state check: if already paid, skip duplicate fulfilment/state downgrade
    if (order.payment_status === 'paid') {
      return c.json({ status: 'OK' });
    }

    if (order.payment_status !== status) {
      await c.env.DB.prepare('UPDATE orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(status, orderId).run();
    }

    if (status === 'paid') {
      await fulfillOrder(orderId, order.user_id, c.env);
    }

    return c.json({ status: 'OK' });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// Xendit Webhook Callback
webhooksRouter.post('/xendit', async (c) => {
  let payload: any;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'Malformed JSON payload' }, 400);
  }
  const headers = Object.fromEntries(c.req.raw.headers.entries());

  try {
    const gateway = getPaymentGateway('xendit', c.env);
    const { orderId, status, grossAmount } = await gateway.verifyWebhook(payload, headers);

    const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<any>();
    if (!order) {
      return c.json({ error: 'Order not found' }, 404);
    }

    // Provider check
    if (order.payment_provider !== 'xendit') {
      return c.json({ error: 'Payment provider mismatch' }, 400);
    }

    // Amount check
    const expectedAmount = Math.round(Number(order.total_amount));
    const paidAmount = Math.round(Number(grossAmount ?? payload.amount));
    if (expectedAmount !== paidAmount) {
      return c.json({ error: 'Payment amount mismatch' }, 400);
    }

    // Monotonic state check: if already paid, skip duplicate fulfilment
    if (order.payment_status === 'paid') {
      return c.json({ status: 'OK' });
    }

    if (order.payment_status !== status) {
      await c.env.DB.prepare('UPDATE orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(status, orderId).run();
    }

    if (status === 'paid') {
      await fulfillOrder(orderId, order.user_id, c.env);
    }

    return c.json({ status: 'OK' });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// Sumopod Webhook Callback (Svix-signed)
webhooksRouter.post('/sumopod', async (c) => {
  let rawBody: string;
  try {
    rawBody = await c.req.text();
  } catch {
    return c.json({ error: 'Malformed JSON payload' }, 400);
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Malformed JSON payload' }, 400);
  }
  const headers = Object.fromEntries(c.req.raw.headers.entries());

  try {
    const gateway = getPaymentGateway('sumopod', c.env);
    const { orderId, status, paymentId, grossAmount } = await gateway.verifyWebhook(payload, headers, rawBody);

    if (!orderId) {
      return c.json({ error: 'Missing order_id in webhook payload' }, 400);
    }

    // Handle topup payments (order_id starts with TOPUP-)
    if (orderId.startsWith('TOPUP-')) {
      if (status === 'paid') {
        // Idempotency check: if already completed, skip cleanly
        const existingCompleted = await c.env.DB.prepare(
          "SELECT id FROM credit_transactions WHERE reference_id = ? AND type = 'topup' LIMIT 1"
        ).bind(orderId).first<any>();

        if (existingCompleted) {
          return c.json({ status: 'OK' });
        }

        // Find pending topup record
        const topupTxn = await c.env.DB.prepare(
          "SELECT * FROM credit_transactions WHERE reference_id = ? AND type = 'topup_pending' LIMIT 1"
        ).bind(orderId).first<any>();

        if (!topupTxn) {
          return c.json({ status: 'OK' });
        }

        // Validate paid amount against pending topup amount
        const expectedAmount = Math.round(Number(topupTxn.amount));
        const paidAmount = Math.round(Number(grossAmount ?? payload.data?.amount));
        if (expectedAmount !== paidAmount) {
          return c.json({ error: 'Topup amount mismatch' }, 400);
        }

        await completeTopup(
          c.env.DB,
          { user_id: topupTxn.user_id, amount: Number(topupTxn.amount), reference_id: orderId },
          `Topup completed via Sumopod (${paymentId})`,
          `Topup ${orderId} credited IDR ${topupTxn.amount}`
        );
      } else if (status === 'failed') {
        await c.env.DB.prepare(
          "DELETE FROM credit_transactions WHERE reference_id = ? AND type = 'topup_pending'"
        ).bind(orderId).run();
      }
      return c.json({ status: 'OK' });
    }

    // Handle regular order payments
    const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<any>();
    if (!order) {
      return c.json({ error: 'Order not found' }, 404);
    }

    // Provider check
    if (order.payment_provider !== 'sumopod') {
      return c.json({ error: 'Payment provider mismatch' }, 400);
    }

    // Amount check
    const expectedAmount = Math.round(Number(order.total_amount));
    const paidAmount = Math.round(Number(grossAmount ?? payload.data?.amount));
    if (expectedAmount !== paidAmount) {
      return c.json({ error: 'Payment amount mismatch' }, 400);
    }

    // Monotonic state check: if already paid, skip duplicate fulfilment
    if (order.payment_status === 'paid') {
      return c.json({ status: 'OK' });
    }

    if (order.payment_status !== status) {
      await c.env.DB.prepare('UPDATE orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(status, orderId).run();
    }

    if (status === 'paid') {
      await fulfillOrder(orderId, order.user_id, c.env);
    }

    return c.json({ status: 'OK' });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});
webhooksRouter.post('/qris', async (c) => {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'Malformed JSON payload' }, 400);
  }

  const headers = Object.fromEntries(c.req.raw.headers.entries());

  try {
    const gateway = getPaymentGateway('qris', c.env);
    const { orderId, status, paymentId, grossAmount } = await gateway.verifyWebhook(payload, headers);

    if (!orderId) {
      return c.json({ error: 'Missing QRIS reference_id' }, 400);
    }

    if (orderId.startsWith('TOPUP-')) {
      const existingCompleted = await c.env.DB.prepare(
        'SELECT * FROM credit_transactions WHERE reference_id = ? AND type = "topup" LIMIT 1'
      ).bind(orderId).first<any>();
      if (existingCompleted) {
        if (status !== 'paid') {
          return c.json({ status: 'OK' });
        }
        const expectedAmount = Math.round(Number(existingCompleted.amount));
        const paidAmount = Math.round(Number(grossAmount));
        if (!Number.isFinite(expectedAmount) || !Number.isFinite(paidAmount) || expectedAmount !== paidAmount) {
          return c.json({ error: 'Topup amount mismatch' }, 400);
        }
        return c.json({ status: 'OK' });
      }

      const topupTxn = await c.env.DB.prepare(
        'SELECT * FROM credit_transactions WHERE reference_id = ? AND type = "topup_pending" LIMIT 1'
      ).bind(orderId).first<any>();
      if (!topupTxn) {
        return c.json({ error: 'Topup reference not found' }, 404);
      }

      if (status === 'pending') {
        return c.json({ status: 'OK' });
      }

      if (status === 'failed') {
        await c.env.DB.prepare(
          'DELETE FROM credit_transactions WHERE reference_id = ? AND type = "topup_pending"'
        ).bind(orderId).run();
        return c.json({ status: 'OK' });
      }

      const expectedAmount = Math.round(Number(topupTxn.amount));
      const paidAmount = Math.round(Number(grossAmount));
      if (!Number.isFinite(expectedAmount) || !Number.isFinite(paidAmount) || expectedAmount !== paidAmount) {
        return c.json({ error: 'Topup amount mismatch' }, 400);
      }

      await completeTopup(
        c.env.DB,
        { user_id: topupTxn.user_id, amount: Number(topupTxn.amount), reference_id: orderId },
        `Topup completed via QRIS (${paymentId})`,
        `Topup ${orderId} credited IDR ${topupTxn.amount} via QRIS`
      );

      return c.json({ status: 'OK' });
    }

    const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<any>();
    if (!order) {
      return c.json({ error: 'Order not found' }, 404);
    }

    if (order.payment_provider !== 'qris') {
      return c.json({ error: 'Payment provider mismatch' }, 400);
    }

    const expectedAmount = Math.round(Number(order.total_amount));
    if (status === 'paid') {
      const paidAmount = Math.round(Number(grossAmount));
      if (!Number.isFinite(expectedAmount) || !Number.isFinite(paidAmount) || expectedAmount !== paidAmount) {
        return c.json({ error: 'Payment amount mismatch' }, 400);
      }
    }

    if (order.payment_status === 'paid') {
      return c.json({ status: 'OK' });
    }

    if (status === 'pending') {
      await c.env.DB.prepare(
        'UPDATE orders SET payment_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND payment_status != "paid"'
      ).bind(paymentId, orderId).run();
      return c.json({ status: 'OK' });
    }

    const transitionResult = await c.env.DB.prepare(
      'UPDATE orders SET payment_id = COALESCE(NULLIF(?, ""), payment_id), payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND payment_status != "paid"'
    ).bind(paymentId, status, orderId).run();
    const transitionChanges = transitionResult.meta?.changes ?? 0;

    if (status === 'paid' && transitionChanges > 0) {
      await fulfillOrder(orderId, order.user_id, c.env);
      await createInAppNotification(c.env.DB, order.user_id, 'Pembayaran berhasil', `Order ${orderId} sedang diproses.`, orderId);
      await sendNotificationWebhook(c.env, {
        event: 'payment.paid',
        orderId,
        userId: order.user_id,
        amount: expectedAmount,
        status: 'paid'
      });
    }

    return c.json({ status: 'OK' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid QRIS webhook';
    const statusCode = message.includes('QRIS webhook secret') || message.includes('Invalid QRIS webhook secret') ? 401 : 400;
    return c.json({ error: message }, statusCode);
  }
});

// HeroSMS Webhook Callback (authenticated fail-closed)
webhooksRouter.post('/herosms', async (c) => {
  const secret = c.req.header('x-webhook-secret');
  if (!c.env.HEROSMS_WEBHOOK_SECRET || !secret || !timingSafeEqual(secret, c.env.HEROSMS_WEBHOOK_SECRET)) {
    return c.json({ error: 'Unauthorized HeroSMS webhook' }, 401);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Malformed JSON payload' }, 400);
  }

  const activationId = body.activation_id || body.id;
  const smsCode = body.code;
  const smsText = body.text || body.full_text;

  if (!activationId) {
    return c.json({ error: 'activation_id missing' }, 400);
  }

  const activation = await c.env.DB.prepare('SELECT * FROM sms_activations WHERE herosms_id = ?').bind(activationId).first<any>();
  if (activation) {
    await c.env.DB.prepare(`
      UPDATE sms_activations
      SET status = 'RECEIVED', sms_code = ?, sms_text = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(smsCode || '', smsText || '', activation.id).run();
  }

  return c.json({ status: 'OK' });
});
