// ponytail: Webhooks endpoint for Midtrans, Xendit, and HeroSMS callbacks (idempotent + signature verification)
import { Hono } from 'hono';
import { Env } from '../types';
import { getPaymentGateway } from '../services/payments';
import { fulfillOrder } from '../services/fulfilment';

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

      if (status === 'paid') {
        await fulfillOrder(orderId, order.user_id, c.env);
      }
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

      if (status === 'paid') {
        await fulfillOrder(orderId, order.user_id, c.env);
      }
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
