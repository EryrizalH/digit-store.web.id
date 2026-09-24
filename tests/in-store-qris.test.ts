import { describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { Env } from '../src/types';

function createMockEnv(overrides: Partial<Record<string, any>> = {}): Env {
  const defaultPrepare = vi.fn((query: string) => {
    const stmt: any = {
      bind: vi.fn(() => stmt),
      first: vi.fn(async () => null),
      all: vi.fn(async () => ({ results: [] })),
      run: vi.fn(async () => ({ success: true, meta: { changes: 1 } }))
    };
    return stmt;
  });

  return {
    DB: {
      prepare: overrides.prepare || defaultPrepare,
      batch: vi.fn(async () => [])
    } as unknown as D1Database,
    FILES_BUCKET: {} as R2Bucket,
    RATE_LIMIT_KV: {} as KVNamespace,
    ASSETS: {} as Fetcher,
    QRIS_API_BASE_URL: 'https://pay.example.com',
    QRIS_API_KEY: 'test-api-key',
    QRIS_WEBHOOK_SECRET: 'test-qris-secret',
    APP_URL: 'https://digit-store.example'
  };
}

describe('In-Store QRIS Endpoints', () => {
  it('GET /api/orders/:id/qr requires authentication', async () => {
    const env = createMockEnv();
    const res = await app.request('/api/orders/ORD-123/qr', { method: 'GET' }, env);
    expect(res.status).toBe(401);
  });

  it('POST /api/orders/:id/regenerate-qris requires authentication', async () => {
    const env = createMockEnv();
    const res = await app.request('/api/orders/ORD-123/regenerate-qris', { method: 'POST' }, env);
    expect(res.status).toBe(401);
  });

  it('GET /api/credits/topup/:id/qr requires authentication', async () => {
    const env = createMockEnv();
    const res = await app.request('/api/credits/topup/TOPUP-123/qr', { method: 'GET' }, env);
    expect(res.status).toBe(401);
  });

  it('GET /api/credits/topup/:id/status requires authentication', async () => {
    const env = createMockEnv();
    const res = await app.request('/api/credits/topup/TOPUP-123/status', { method: 'GET' }, env);
    expect(res.status).toBe(401);
  });

  it('GET /api/orders/:id/qr returns 404 if order not found or not qris', async () => {
    const user = { id: 'u1', email: 'test@example.com', role: 'user' };
    const prepare = vi.fn((query: string) => {
      const stmt: any = {
        bind: vi.fn(() => stmt),
        first: vi.fn(async () => {
          if (query.includes('FROM sessions')) return { user_id: 'u1', expires_at: Date.now() + 100000 };
          if (query.includes('FROM users')) return user;
          if (query.includes('SELECT payment_id, payment_provider')) return null;
          return null;
        }),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => ({ success: true, meta: { changes: 1 } }))
      };
      return stmt;
    });

    const env = createMockEnv({ prepare });
    const res = await app.request('/api/orders/ORD-NONEXISTENT/qr', {
      method: 'GET',
      headers: { Cookie: 'session=sess_123' }
    }, env);

    expect(res.status).toBe(404);
  });

  it('GET /api/orders/:id/qr proxies raw image from gateway', async () => {
    const user = { id: 'u1', email: 'test@example.com', role: 'user' };
    const prepare = vi.fn((query: string) => {
      const stmt: any = {
        bind: vi.fn(() => stmt),
        first: vi.fn(async () => {
          if (query.includes('FROM sessions')) return { user_id: 'u1', expires_at: Date.now() + 100000 };
          if (query.includes('FROM users')) return user;
          if (query.includes('SELECT payment_id, payment_provider')) {
            return { payment_id: 'qris_test_123', payment_provider: 'qris', payment_status: 'pending' };
          }
          return null;
        }),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => ({ success: true, meta: { changes: 1 } }))
      };
      return stmt;
    });

    const env = createMockEnv({ prepare });
    const fetchMock = vi.fn().mockResolvedValue(new Response('image-png-content', {
      status: 200,
      headers: { 'Content-Type': 'image/png' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const res = await app.request('/api/orders/ORD-VALID/qr', {
        method: 'GET',
        headers: { Cookie: 'session=sess_123' }
      }, env);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/png');
      expect(fetchMock).toHaveBeenCalledWith('https://pay.example.com/qr/qris_test_123?format=raw');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('POST /api/orders/:id/regenerate-qris generates a new QRIS for pending order', async () => {
    const user = { id: 'u1', email: 'test@example.com', role: 'user' };
    let updatedPaymentId = '';
    const prepare = vi.fn((query: string) => {
      const stmt: any = {
        bind: vi.fn((...args: any[]) => {
          if (query.includes('UPDATE orders SET payment_id')) {
            updatedPaymentId = args[0];
          }
          return stmt;
        }),
        first: vi.fn(async () => {
          if (query.includes('FROM sessions')) return { user_id: 'u1', expires_at: Date.now() + 100000 };
          if (query.includes('FROM users')) return user;
          if (query.includes('SELECT * FROM orders WHERE id = ?')) {
            return { id: 'ORD-VALID', user_id: 'u1', total_amount: 50000, payment_provider: 'qris', payment_status: 'pending' };
          }
          return null;
        }),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => ({ success: true, meta: { changes: 1 } }))
      };
      return stmt;
    });

    const env = createMockEnv({ prepare });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: {
        qris_id: 'qris_new_456',
        trx_id: 'TRX-NEW-456',
        qris_url: 'https://pay.example.com/qr/qris_new_456',
        qris_code: '000201010212...',
        expires_at: '2026-09-24T12:05:00.000Z'
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const res = await app.request('/api/orders/ORD-VALID/regenerate-qris', {
        method: 'POST',
        headers: { Cookie: 'session=sess_123', 'Content-Type': 'application/json' }
      }, env);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.paymentId).toBe('qris_new_456');
      expect(data.qrImageUrl).toBe('/api/orders/ORD-VALID/qr');
      expect(updatedPaymentId).toBe('qris_new_456');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('GET /api/credits/topup/:id/status returns pending or paid status', async () => {
    const user = { id: 'u1', email: 'test@example.com', role: 'user' };
    const prepare = vi.fn((query: string) => {
      const stmt: any = {
        bind: vi.fn(() => stmt),
        first: vi.fn(async () => {
          if (query.includes('FROM sessions')) return { user_id: 'u1', expires_at: Date.now() + 100000 };
          if (query.includes('FROM users')) return user;
          if (query.includes('SELECT * FROM credit_transactions WHERE reference_id = ?')) {
            return { reference_id: 'TOPUP-001', user_id: 'u1', type: 'topup', amount: 20000 };
          }
          if (query.includes('FROM user_credits WHERE user_id = ?')) {
            return { balance: 25000 };
          }
          return null;
        }),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => ({ success: true, meta: { changes: 1 } }))
      };
      return stmt;
    });

    const env = createMockEnv({ prepare });
    const res = await app.request('/api/credits/topup/TOPUP-001/status', {
      method: 'GET',
      headers: { Cookie: 'session=sess_123' }
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.topupId).toBe('TOPUP-001');
    expect(data.status).toBe('paid');
    expect(data.balance).toBe(25000);
  });

  it('POST /api/orders/:id/regenerate-qris returns 502 JSON when gateway fails', async () => {
    const user = { id: 'u1', email: 'test@example.com', role: 'user' };
    const prepare = vi.fn((query: string) => {
      const stmt: any = {
        bind: vi.fn(() => stmt),
        first: vi.fn(async () => {
          if (query.includes('FROM sessions')) return { user_id: 'u1', expires_at: Date.now() + 100000 };
          if (query.includes('FROM users')) return user;
          if (query.includes('SELECT * FROM orders WHERE id = ?')) {
            return { id: 'ORD-FAIL', user_id: 'u1', total_amount: 10000, payment_provider: 'qris', payment_status: 'pending' };
          }
          return null;
        }),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => ({ success: true, meta: { changes: 1 } }))
      };
      return stmt;
    });

    const env = createMockEnv({ prepare });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      message: 'Autentikasi Gagal: API Key tidak valid'
    }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const res = await app.request('/api/orders/ORD-FAIL/regenerate-qris', {
        method: 'POST',
        headers: { Cookie: 'session=sess_123', 'Content-Type': 'application/json' }
      }, env);

      expect(res.status).toBe(502);
      expect(res.headers.get('Content-Type')).toContain('application/json');
      const data = await res.json() as any;
      expect(data.code).toBe('PAYMENT_GATEWAY_ERROR');
      expect(data.error).toContain('Autentikasi Gagal');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('POST /api/orders/checkout returns 502 JSON and rolls back if gateway throws', async () => {
    const user = { id: 'u1', email: 'test@example.com', role: 'user' };
    const product = { id: 'p1', name: 'Software', type: 'code', price: 15000, is_active: 1 };
    const executedQueries: string[] = [];

    const prepare = vi.fn((query: string) => {
      executedQueries.push(query);
      const stmt: any = {
        bind: vi.fn(() => stmt),
        first: vi.fn(async () => {
          if (query.includes('FROM sessions')) return { user_id: 'u1', expires_at: Date.now() + 100000 };
          if (query.includes('FROM users')) return user;
          if (query.includes('SELECT * FROM products WHERE id = ?')) return product;
          if (query.includes('SELECT COUNT(*) as count FROM stock_codes')) return { count: 5 };
          return null;
        }),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => ({ success: true, meta: { changes: 1 } }))
      };
      return stmt;
    });

    const env = createMockEnv({ prepare });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      message: 'Autentikasi Gagal: API Key tidak valid'
    }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const res = await app.request('/api/orders/checkout', {
        method: 'POST',
        headers: { Cookie: 'session=sess_123', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ product_id: 'p1', quantity: 1 }],
          payment_provider: 'qris'
        })
      }, env);

      expect(res.status).toBe(502);
      expect(res.headers.get('Content-Type')).toContain('application/json');
      const data = await res.json() as any;
      expect(data.code).toBe('PAYMENT_GATEWAY_ERROR');
      expect(data.error).toContain('Autentikasi Gagal');

      // Verify order rollback happened
      expect(executedQueries.some(q => q.includes('DELETE FROM orders WHERE id = ?'))).toBe(true);
      expect(executedQueries.some(q => q.includes('DELETE FROM order_items WHERE order_id = ?'))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
