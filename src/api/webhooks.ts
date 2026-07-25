// ponytail: Webhooks endpoint for Midtrans, Xendit, Sumopod, and HeroSMS callbacks (idempotent + safe retry on paid status)
import { Hono } from 'hono';
import { Env } from '../types';
import { getPaymentGateway } from '../services/payments';
import { fulfillOrder } from '../services/fulfilment';
import { addCredit } from '../services/credits';

export const webhooksRouter = new Hono<{ Bindings: Env }>();

// Midtrans Webhook Callback
webhooksRouter.post('/midtrans', async (c) => {
  const payload = await c.req.json();
  const headers = Object.fromEntries(c.req.raw.headers.entries());

  try {
    const gateway = getPaymentGateway('midtrans', c.env);
    const { orderId, status } = await gateway.verifyWebhook(payload, headers);

    const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<any>();
    if (!order) {
      return c.json({ error: 'Order not found' }, 404);
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
  const payload = await c.req.json();
  const headers = Object.fromEntries(c.req.raw.headers.entries());

  try {
    const gateway = getPaymentGateway('xendit', c.env);
    const { orderId, status } = await gateway.verifyWebhook(payload, headers);

    const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<any>();
    if (!order) {
      return c.json({ error: 'Order not found' }, 404);
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
  const payload = await c.req.json();
  const headers = Object.fromEntries(c.req.raw.headers.entries());

  try {
    const gateway = getPaymentGateway('sumopod', c.env);
    const { orderId, status, paymentId } = await gateway.verifyWebhook(payload, headers);

    if (!orderId) {
      return c.json({ error: 'Missing order_id in webhook payload' }, 400);
    }

    // Handle topup payments (order_id starts with TOPUP-)
    if (orderId.startsWith('TOPUP-')) {
      if (status === 'paid') {
        // Find the pending topup transaction
        const topupTxn = await c.env.DB.prepare(
          "SELECT * FROM credit_transactions WHERE reference_id = ? AND type = 'topup' LIMIT 1"
        ).bind(orderId).first<any>();

        if (topupTxn) {
          // Credit the user balance
          await addCredit(c.env.DB, topupTxn.user_id, topupTxn.amount, 'topup', orderId, `Topup completed via Sumopod (${paymentId})`);

          // Remove the pending tracking record (replace with the actual credited one)
          await c.env.DB.prepare('DELETE FROM credit_transactions WHERE id = ?').bind(topupTxn.id).run();

          // Audit log
          await c.env.DB.prepare(`
            INSERT INTO audit_logs (id, user_id, action, details)
            VALUES (?, ?, ?, ?)
          `).bind(
            `log_${crypto.randomUUID()}`,
            topupTxn.user_id,
            'CREDIT_TOPUP_COMPLETED',
            `Topup ${orderId} credited IDR ${topupTxn.amount}`
          ).run();
        }
      }
      return c.json({ status: 'OK' });
    }

    // Handle regular order payments
    const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<any>();
    if (!order) {
      return c.json({ error: 'Order not found' }, 404);
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

// HeroSMS Webhook Callback
webhooksRouter.post('/herosms', async (c) => {
  const body = await c.req.json().catch(() => null) || {};
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
