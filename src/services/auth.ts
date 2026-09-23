import { D1Database } from '@cloudflare/workers-types';
import { User, Session } from '../types';

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  if (typeof (crypto as any).timingSafeEqual === 'function') {
    return (crypto as any).timingSafeEqual(a, b);
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  return constantTimeEqual(enc.encode(a), enc.encode(b));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const saltHex = bytesToHex(salt);
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    KEY_BITS
  );
  const hashHex = bytesToHex(new Uint8Array(derivedBits));
  return `pbkdf2:v1:${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;
  const encoder = new TextEncoder();

  if (storedHash.startsWith('pbkdf2:v1:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 5) return false;
    const iterations = parseInt(parts[2], 10);
    const saltHex = parts[3];
    const expectedHashHex = parts[4];
    if (isNaN(iterations) || iterations < 1 || !saltHex || !expectedHashHex) return false;

    const salt = hexToBytes(saltHex);
    const expectedBytes = hexToBytes(expectedHashHex);

    const baseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt as any,
        iterations,
        hash: 'SHA-256'
      },
      baseKey,
      KEY_BITS
    );
    return constantTimeEqual(new Uint8Array(derivedBits), expectedBytes);
  }

  // Legacy SHA-256 verify: hash:salt
  if (storedHash.includes(':')) {
    const [storedHex, salt] = storedHash.split(':');
    if (!storedHex || !salt) return false;
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const computedBytes = new Uint8Array(hashBuffer);
    const storedBytes = hexToBytes(storedHex);
    return constantTimeEqual(computedBytes, storedBytes);
  }

  return false;
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
