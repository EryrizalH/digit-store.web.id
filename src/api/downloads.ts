// ponytail: Stream digital download files securely from R2 bucket via entitlement token
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { Env } from '../types';
import { getSessionUser } from '../services/auth';

export const downloadsRouter = new Hono<{ Bindings: Env }>();

downloadsRouter.get('/:token', async (c) => {
  const token = c.req.param('token');
  const sessionId = getCookie(c, 'session');
  const user = await getSessionUser(c.env.DB, sessionId || '');

  if (!user) {
    return c.json({ error: 'Please log in to download this file.' }, 401);
  }

  const entitlement = await c.env.DB.prepare(`
    SELECT fe.*, p.name as product_name, p.r2_key
    FROM file_entitlements fe
    JOIN products p ON fe.product_id = p.id
    WHERE fe.download_token = ? AND fe.user_id = ?
  `).bind(token, user.id).first<any>();

  if (!entitlement) {
    return c.json({ error: 'Download token invalid or does not belong to your account.' }, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  if (entitlement.expires_at < now) {
    return c.json({ error: 'Download link has expired.' }, 410);
  }

  if (!entitlement.r2_key) {
    return c.json({ error: 'File object key not found for this product.' }, 404);
  }

  // Fetch object from R2 private bucket
  const object = await c.env.FILES_BUCKET.get(entitlement.r2_key);
  if (!object) {
    return c.json({ error: 'File not found in storage bucket.' }, 404);
  }

  const filename = entitlement.r2_key.split('/').pop() || `${entitlement.product_name}.zip`;

  // Audit log download
  await c.env.DB.prepare(`
    INSERT INTO audit_logs (id, user_id, action, details)
    VALUES (?, ?, ?, ?)
  `).bind(`log_${crypto.randomUUID()}`, user.id, 'DOWNLOAD_FILE', `Downloaded ${filename} via token ${token}`).run();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Content-Disposition', `attachment; filename="${filename}"`);

  return new Response(object.body as ReadableStream, { headers });
});
