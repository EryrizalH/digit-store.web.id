import { D1Database } from '@cloudflare/workers-types';
import { Env } from '../types';

export async function createInAppNotification(
  db: D1Database,
  userId: string,
  title: string,
  message: string,
  orderId?: string | null
): Promise<void> {
  try {
    await db.prepare(`INSERT INTO notifications (id, user_id, order_id, channel, title, message) VALUES (?, ?, ?, 'in_app', ?, ?)`)
      .bind(`ntf_${crypto.randomUUID()}`, userId, orderId || null, title, message).run();
  } catch {
    // Notification delivery must never make payment or fulfilment fail.
  }
}

export async function sendNotificationWebhook(env: Env, payload: Record<string, unknown>): Promise<void> {
  if (!env.NOTIFICATION_WEBHOOK_URL) return;
  try {
    await fetch(env.NOTIFICATION_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'digit-store', ...payload })
    });
  } catch {
    // External notification failure must not fail checkout or fulfilment.
  }
}
