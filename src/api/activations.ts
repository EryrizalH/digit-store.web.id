// ponytail: HeroSMS activation polling & cancellation sub-router
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { Env } from '../types';
import { getSessionUser } from '../services/auth';
import { HeroSmsClient, HeroSmsError } from '../services/herosms';
import { checkRateLimit } from '../services/rate-limit';

export const activationsRouter = new Hono<{ Bindings: Env }>();

activationsRouter.get('/:id/poll', async (c) => {
  const sessionId = getCookie(c, 'session');
  const user = await getSessionUser(c.env.DB, sessionId || '');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const activationId = c.req.param('id');

  // Rate limit polling (max 30 requests per minute)
  const rl = await checkRateLimit(c.env.RATE_LIMIT_KV, `poll:${user.id}:${activationId}`, 30, 60);
  if (!rl.success) {
    return c.json({ error: 'Polling limit exceeded' }, 429);
  }

  const activation = await c.env.DB.prepare('SELECT * FROM sms_activations WHERE id = ? AND (user_id = ? OR ? = "admin")')
    .bind(activationId, user.id, user.role).first<any>();

  if (!activation) {
    return c.json({ error: 'Activation record not found' }, 404);
  }

  if (activation.status === 'WAITING_CODE') {
    const heroClient = new HeroSmsClient(c.env.HEROSMS_API_KEY || '', c.env.HEROSMS_BASE_URL);
    try {
      const result = await heroClient.getStatus(activation.herosms_id);

      if (result.status === 'RECEIVED') {
        await c.env.DB.prepare(`
          UPDATE sms_activations
          SET status = 'RECEIVED', sms_code = ?, sms_text = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(result.code || '', result.fullText || '', activation.id).run();

        activation.status = 'RECEIVED';
        activation.sms_code = result.code;
        activation.sms_text = result.fullText;
      } else if (result.status === 'TIMEOUT' || result.status === 'CANCELLED') {
        await c.env.DB.prepare(`
          UPDATE sms_activations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(result.status, activation.id).run();
        activation.status = result.status;
      }
    } catch (err: any) {
      // Preserve activation state in DB, return 502 Bad Gateway with provider error details
      return c.json({
        error: 'HeroSMS provider status check failed',
        details: err instanceof HeroSmsError ? err.code : (err.message || 'Provider error'),
        activation
      }, 502);
    }
  }

  return c.json({ activation });
});

activationsRouter.post('/:id/cancel', async (c) => {
  const sessionId = getCookie(c, 'session');
  const user = await getSessionUser(c.env.DB, sessionId || '');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const activationId = c.req.param('id');
  const activation = await c.env.DB.prepare('SELECT * FROM sms_activations WHERE id = ? AND user_id = ?')
    .bind(activationId, user.id).first<any>();

  if (!activation) return c.json({ error: 'Activation not found' }, 404);
  if (activation.status !== 'WAITING_CODE') {
    return c.json({ error: 'Activation status is not WAITING_CODE' }, 400);
  }

  const heroClient = new HeroSmsClient(c.env.HEROSMS_API_KEY || '', c.env.HEROSMS_BASE_URL);
  try {
    const success = await heroClient.cancelActivation(activation.herosms_id);
    if (!success) {
      return c.json({ error: 'Cancellation rejected by provider', activation }, 400);
    }

    await c.env.DB.prepare(`
      UPDATE sms_activations SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(activation.id).run();

    return c.json({ success: true, message: 'Activation cancelled' });
  } catch (err: any) {
    // Preserve activation state in DB if cancellation fails or is rejected
    return c.json({
      error: 'Cancellation failed',
      details: err instanceof HeroSmsError ? err.code : (err.message || 'Provider cancellation error'),
      activation
    }, 400);
  }
});
