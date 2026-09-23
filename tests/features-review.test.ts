import { describe, it, expect, vi } from 'vitest';
import app from '../src/index';
import { Env } from '../src/types';

function createStmt(handlers: {
  first?: () => Promise<any>;
  all?: () => Promise<any>;
  run?: () => Promise<any>;
} = {}) {
  const stmt: any = {
    bind: vi.fn(() => stmt),
    first: handlers.first || vi.fn().mockResolvedValue(null),
    all: handlers.all || vi.fn().mockResolvedValue({ results: [] }),
    run: handlers.run || vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
  };
  return stmt;
}

function createMockEnv(overrides: Partial<Env> = {}): Env {
  const defaultStmt = createStmt();
  const mockDb = {
    prepare: vi.fn().mockReturnValue(defaultStmt),
    batch: vi.fn().mockImplementation(async (stmts: any[]) => (stmts || []).map(() => ({ success: true, meta: { changes: 1 } }))),
  } as any;

  const mockR2 = {
    get: vi.fn(),
    put: vi.fn().mockResolvedValue({}),
  } as any;

  const mockKv = {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  } as any;

  return {
    DB: mockDb,
    FILES_BUCKET: mockR2,
    RATE_LIMIT_KV: mockKv,
    ASSETS: {} as any,
    APP_URL: 'https://digit-store.web.id',
    APP_ENV: 'test',
    ...overrides,
  };
}

describe('New Features Review & Verification Tests', () => {
  describe('SEO & Discovery: /sitemap.xml and /robots.txt', () => {
    it('generates valid sitemap.xml without crashing and queries created_at', async () => {
      const env = createMockEnv();
      let queryRun = '';
      env.DB.prepare = vi.fn().mockImplementation((query: string) => {
        queryRun = query;
        return createStmt({
          all: async () => ({
            results: [
              { slug: 'vpn-premium', created_at: '2026-09-20 10:00:00' },
              { slug: 'netflix-1-month', created_at: '2026-09-21 12:00:00' },
            ]
          })
        });
      });

      const res = await app.request('/sitemap.xml', { method: 'GET' }, env);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/xml');

      const xml = await res.text();
      expect(xml).toContain('<urlset');
      expect(xml).toContain('https://digit-store.web.id/produk/vpn-premium');
      expect(xml).toContain('https://digit-store.web.id/produk/netflix-1-month');
      expect(xml).toContain('https://digit-store.web.id/bantuan');

      // Verify that query uses created_at, NOT updated_at
      expect(queryRun).toContain('created_at');
      expect(queryRun).not.toContain('updated_at');
    });

    it('generates robots.txt with disallow paths and sitemap link', async () => {
      const env = createMockEnv();
      const res = await app.request('/robots.txt', { method: 'GET' }, env);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('Disallow: /admin');
      expect(text).toContain('Disallow: /api/');
      expect(text).toContain('Sitemap: https://digit-store.web.id/sitemap.xml');
    });
  });

  describe('Guest Accounts & Registration Upgrade', () => {
    it('creates guest checkout session without password', async () => {
      const env = createMockEnv();
      env.DB.prepare = vi.fn().mockImplementation((query: string) => {
        if (query.includes('FROM users WHERE email = ?')) {
          return createStmt({ first: async () => null });
        }
        return createStmt({
          run: async () => ({ success: true, meta: { changes: 1 } }),
        });
      });

      const res = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'newbuyer@example.com' })
      }, env);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.user.is_guest).toBe(1);
      expect(json.user.email).toBe('newbuyer@example.com');
      expect(res.headers.get('set-cookie')).toContain('session=');
    });

    it('rejects guest checkout if email already has registered account', async () => {
      const env = createMockEnv();
      env.DB.prepare = vi.fn().mockImplementation((query: string) => {
        if (query.includes('FROM users WHERE email = ?')) {
          return createStmt({ first: async () => ({ id: 'usr_existing' }) });
        }
        return createStmt();
      });

      const res = await app.request('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'registered@example.com' })
      }, env);

      expect(res.status).toBe(409);
      const json = await res.json() as any;
      expect(json.code).toBe('ACCOUNT_EXISTS');
    });

    it('upgrades unclaimed guest account on permanent registration', async () => {
      const env = createMockEnv();
      let updatedGuest = false;

      env.DB.prepare = vi.fn().mockImplementation((query: string) => {
        if (query.includes('SELECT id, is_guest, password_hash FROM users WHERE email = ?')) {
          return createStmt({
            first: async () => ({ id: 'gst_12345', is_guest: 1, password_hash: null })
          });
        }
        if (query.includes('UPDATE users SET password_hash = ?, is_guest = 0 WHERE id = ?')) {
          return createStmt({
            run: async () => {
              updatedGuest = true;
              return { success: true, meta: { changes: 1 } };
            }
          });
        }
        return createStmt({
          run: async () => ({ success: true, meta: { changes: 1 } }),
        });
      });

      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'guest@example.com', password: 'NewPassword123' })
      }, env);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.user.id).toBe('gst_12345');
      expect(updatedGuest).toBe(true);
    });
  });

  describe('Notifications API', () => {
    it('returns notifications and unread count for authenticated user', async () => {
      const env = createMockEnv();
      env.DB.prepare = vi.fn().mockImplementation((query: string) => {
        if (query.includes('FROM sessions s')) {
          return createStmt({
            first: async () => ({ id: 'usr_buyer', email: 'buyer@example.com', role: 'user' })
          });
        }
        if (query.includes('FROM notifications WHERE user_id = ? ORDER BY')) {
          return createStmt({
            all: async () => ({
              results: [
                { id: 'ntf_1', title: 'Pesanan dibuat', message: 'Order ORD-1 created', read_at: null }
              ]
            })
          });
        }
        if (query.includes('SELECT COUNT(*) as count FROM notifications')) {
          return createStmt({
            first: async () => ({ count: 1 })
          });
        }
        return createStmt();
      });

      const res = await app.request('/api/notifications', {
        method: 'GET',
        headers: { Cookie: 'session=valid_session_token' }
      }, env);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.unreadCount).toBe(1);
      expect(json.notifications).toHaveLength(1);
      expect(json.notifications[0].title).toBe('Pesanan dibuat');
    });

    it('marks notification as read', async () => {
      const env = createMockEnv();
      let markedRead = false;
      env.DB.prepare = vi.fn().mockImplementation((query: string) => {
        if (query.includes('FROM sessions s')) {
          return createStmt({
            first: async () => ({ id: 'usr_buyer', email: 'buyer@example.com', role: 'user' })
          });
        }
        if (query.includes('UPDATE notifications SET read_at = CURRENT_TIMESTAMP')) {
          return createStmt({
            run: async () => {
              markedRead = true;
              return { success: true, meta: { changes: 1 } };
            }
          });
        }
        return createStmt();
      });

      const res = await app.request('/api/notifications/ntf_1/read', {
        method: 'POST',
        headers: { Cookie: 'session=valid_session_token' }
      }, env);

      expect(res.status).toBe(200);
      expect(markedRead).toBe(true);
    });
  });

  describe('Support Tickets', () => {
    it('requires at least 10 characters for issue message', async () => {
      const env = createMockEnv();
      env.DB.prepare = vi.fn().mockImplementation((query: string) => {
        if (query.includes('FROM sessions s')) {
          return createStmt({
            first: async () => ({ id: 'usr_buyer', email: 'buyer@example.com', role: 'user' })
          });
        }
        if (query.includes('FROM orders WHERE id = ? AND user_id = ?')) {
          return createStmt({
            first: async () => ({ id: 'ORD-100', user_id: 'usr_buyer' })
          });
        }
        return createStmt();
      });

      const res = await app.request('/api/orders/ORD-100/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=valid_session_token'
        },
        body: JSON.stringify({ message: 'pendek' })
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.error).toContain('minimal 10 karakter');
    });

    it('creates support ticket successfully for valid request', async () => {
      const env = createMockEnv();
      let ticketInserted = false;
      env.DB.prepare = vi.fn().mockImplementation((query: string) => {
        if (query.includes('FROM sessions s')) {
          return createStmt({
            first: async () => ({ id: 'usr_buyer', email: 'buyer@example.com', role: 'user' })
          });
        }
        if (query.includes('FROM orders WHERE id = ? AND user_id = ?')) {
          return createStmt({
            first: async () => ({ id: 'ORD-100', user_id: 'usr_buyer' })
          });
        }
        if (query.includes('INSERT INTO support_tickets')) {
          return createStmt({
            run: async () => {
              ticketInserted = true;
              return { success: true, meta: { changes: 1 } };
            }
          });
        }
        return createStmt();
      });

      const res = await app.request('/api/orders/ORD-100/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=valid_session_token'
        },
        body: JSON.stringify({ subject: 'Kode invalid', message: 'Kode yang diterima tidak dapat diaktivasi.' })
      }, env);

      expect(res.status).toBe(201);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.ticket.status).toBe('open');
      expect(ticketInserted).toBe(true);
    });
  });

  describe('Product Reviews', () => {
    it('returns approved product reviews and aggregate summary', async () => {
      const env = createMockEnv();
      env.DB.prepare = vi.fn().mockImplementation((query: string) => {
        if (query.includes('FROM product_reviews r JOIN users u')) {
          return createStmt({
            all: async () => ({
              results: [
                { id: 'rev_1', rating: 5, body: 'Layanan cepat dan terpercaya.', verified_purchase: 1, author: 'er***' }
              ]
            })
          });
        }
        if (query.includes('COALESCE(AVG(rating), 0) as average')) {
          return createStmt({
            first: async () => ({ count: 1, average: 5.0 })
          });
        }
        return createStmt();
      });

      const res = await app.request('/api/products/by-id/prd_1/reviews', { method: 'GET' }, env);
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.reviews).toHaveLength(1);
      expect(json.summary.average).toBe(5);
      expect(json.summary.count).toBe(1);
    });

    it('rejects review if user did not purchase or order is not fulfilled', async () => {
      const env = createMockEnv();
      env.DB.prepare = vi.fn().mockImplementation((query: string) => {
        if (query.includes('FROM sessions s')) {
          return createStmt({
            first: async () => ({ id: 'usr_buyer', email: 'buyer@example.com', role: 'user' })
          });
        }
        if (query.includes('FROM products WHERE id = ? AND is_active = 1')) {
          return createStmt({
            first: async () => ({ id: 'prd_1' })
          });
        }
        if (query.includes('FROM order_items oi JOIN orders o')) {
          return createStmt({
            first: async () => null // No fulfilled purchase
          });
        }
        return createStmt();
      });

      const res = await app.request('/api/products/by-id/prd_1/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=valid_session_token'
        },
        body: JSON.stringify({ rating: 5, body: 'Mencoba memberikan review tanpa membeli' })
      }, env);

      expect(res.status).toBe(403);
      const json = await res.json() as any;
      expect(json.error).toContain('hanya tersedia setelah pembelian berhasil dikirim');
    });
  });
});
