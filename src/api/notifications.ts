import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { Env, User } from '../types';
import { getSessionUser } from '../services/auth';

export const notificationsRouter = new Hono<{ Bindings: Env; Variables: { user?: User } }>();

async function auth(c: any): Promise<User | null> {
  return getSessionUser(c.env.DB, getCookie(c, 'session') || '');
}

notificationsRouter.get('/', async (c) => {
  const user = await auth(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const result = await c.env.DB.prepare('SELECT id, order_id, title, message, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30').bind(user.id).all();
  const unread = await c.env.DB.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(user.id).first<any>();
  return c.json({ notifications: result.results || [], unreadCount: Number(unread?.count || 0) });
});

notificationsRouter.post('/:id/read', async (c) => {
  const user = await auth(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  await c.env.DB.prepare('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).run();
  return c.json({ success: true });
});
