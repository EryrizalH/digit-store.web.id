// ponytail: Workers Web Crypto SHA-256 + salt password hashing (lightweight, zero-deps, CPU safe)
import { D1Database } from '@cloudflare/workers-types';
import { User, Session } from '../types';

export async function hashPassword(password: string, saltInput?: string): Promise<string> {
  const salt = saltInput || crypto.randomUUID().replace(/-/g, '').substring(0, 16);
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hashHex}:${salt}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [hash, salt] = storedHash.split(':');
  const computed = await hashPassword(password, salt);
  return computed === storedHash;
}

export function generateToken(): string {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const sessionId = generateToken();
  const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days
  
  await db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, userId, expiresAt).run();
  
  return sessionId;
}

export async function getSessionUser(db: D1Database, sessionId: string): Promise<User | null> {
  if (!sessionId) return null;
  const now = Math.floor(Date.now() / 1000);
  
  const res = await db.prepare(`
    SELECT u.id, u.email, u.role, u.google_id, u.created_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > ?
  `).bind(sessionId, now).first<User>();
  
  return res || null;
}

export async function revokeSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}
