import { describe, it, expect, vi } from 'vitest';
import app from '../src/index';
import { Env } from '../src/types';

function createMockEnv(overrides: Partial<Env> = {}): Env {
  const mockDb = {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
    }),
    batch: vi.fn().mockImplementation(async (stmts: any[]) => (stmts || []).map(() => ({ success: true, meta: { changes: 1 } }))),
  } as any;

  const mockR2 = {
    get: vi.fn(),
    put: vi.fn().mockResolvedValue({}),
  } as any;

  const mockKv = {
    get: vi.fn(),
    put: vi.fn(),
  } as any;

  return {
    DB: mockDb,
    FILES_BUCKET: mockR2,
    RATE_LIMIT_KV: mockKv,
    ASSETS: {} as any,
    HEROSMS_WEBHOOK_SECRET: 'test-herosms-secret-12345',
    ...overrides,
  };
}

describe('Follow-up Hardening Verification Tests', () => {
  describe('Issue 4: Health Check Quota/Limit Disclosure', () => {
    it('returns status ok without disclosing infrastructure limits or quotas', async () => {
      const env = createMockEnv();
      const res = await app.request('/api/health', { method: 'GET' }, env);
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.status).toBe('ok');
      expect(json.time).toBeDefined();
      expect(json.limits).toBeUndefined();
    });
  });

  describe('Issue 2: Webhooks Malformed JSON Guarding', () => {
    it('returns structured 400 for malformed JSON in Midtrans webhook', async () => {
      const env = createMockEnv();
      const res = await app.request('/api/webhooks/midtrans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json{'
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.error).toBe('Malformed JSON payload');
    });

    it('returns structured 400 for malformed JSON in Xendit webhook', async () => {
      const env = createMockEnv();
      const res = await app.request('/api/webhooks/xendit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad:json'
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.error).toBe('Malformed JSON payload');
    });

    it('returns structured 400 for malformed JSON in Sumopod webhook', async () => {
      const env = createMockEnv();
      const res = await app.request('/api/webhooks/sumopod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not a valid json string'
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.error).toBe('Malformed JSON payload');
    });
  });

  describe('Issue 6: HeroSMS Webhook Constant-Time Auth & Query Param Rejection', () => {
    it('rejects unauthenticated HeroSMS webhook requests', async () => {
      const env = createMockEnv();
      const res = await app.request('/api/webhooks/herosms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activation_id: '123' })
      }, env);

      expect(res.status).toBe(401);
      const json = await res.json() as any;
      expect(json.error).toBe('Unauthorized HeroSMS webhook');
    });

    it('rejects secret passed in query parameter to avoid logging secrets in access logs', async () => {
      const env = createMockEnv();
      const res = await app.request('/api/webhooks/herosms?secret=test-herosms-secret-12345', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activation_id: '123' })
      }, env);

      expect(res.status).toBe(401);
      const json = await res.json() as any;
      expect(json.error).toBe('Unauthorized HeroSMS webhook');
    });

    it('rejects invalid secret header', async () => {
      const env = createMockEnv();
      const res = await app.request('/api/webhooks/herosms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': 'wrong-secret'
        },
        body: JSON.stringify({ activation_id: '123' })
      }, env);

      expect(res.status).toBe(401);
    });

    it('accepts valid secret in x-webhook-secret header', async () => {
      const env = createMockEnv();
      env.DB.prepare = vi.fn().mockImplementation((query: string) => ({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ id: 'act_1' }),
          run: vi.fn().mockResolvedValue({ success: true })
        })
      }));

      const res = await app.request('/api/webhooks/herosms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': 'test-herosms-secret-12345'
        },
        body: JSON.stringify({ activation_id: '123', code: '998811' })
      }, env);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.status).toBe('OK');
    });
  });

  describe('Issue 3: Products include_all=1 Admin Authorization', () => {
    it('allows public catalog without include_all without authentication', async () => {
      const env = createMockEnv();
      const res = await app.request('/api/products', { method: 'GET' }, env);
      expect(res.status).toBe(200);
    });

    it('rejects include_all=1 without admin session', async () => {
      const env = createMockEnv();
      const res = await app.request('/api/products?include_all=1', { method: 'GET' }, env);
      expect(res.status).toBe(403);
      const json = await res.json() as any;
      expect(json.error).toContain('Unauthorized. Admin access required.');
    });

    it('rejects include_all=1 for non-admin user', async () => {
      const env = createMockEnv();
      env.DB.prepare = vi.fn().mockImplementation((query: string) => {
        if (query.includes('sessions')) {
          return {
            bind: () => ({
              first: async () => ({ id: 'usr_user', email: 'user@test.com', role: 'user' })
            })
          };
        }
        return {
          bind: () => ({
            first: async () => null,
            all: async () => ({ results: [] })
          })
        };
      });

      const res = await app.request('/api/products?include_all=1', {
        method: 'GET',
        headers: { Cookie: 'session=user-session-123' }
      }, env);

      expect(res.status).toBe(403);
    });

    it('allows include_all=1 for admin user', async () => {
      const env = createMockEnv();
      env.DB.prepare = vi.fn().mockImplementation((query: string) => {
        if (query.includes('sessions')) {
          return {
            bind: () => ({
              first: async () => ({ id: 'usr_admin', email: 'admin@test.com', role: 'admin' })
            })
          };
        }
        return {
          bind: () => ({
            all: async () => ({ results: [{ id: 'p1', name: 'Product 1', slug: 'p1', price: 1000, type: 'herosms', is_active: 1 }] })
          }),
          all: async () => ({ results: [{ id: 'p1', name: 'Product 1', slug: 'p1', price: 1000, type: 'herosms', is_active: 1 }] })
        };
      });

      const res = await app.request('/api/products?include_all=1', {
        method: 'GET',
        headers: { Cookie: 'session=admin-session-123' }
      }, env);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.products).toBeDefined();
    });
  });

  describe('Issue 7: Admin Stock File Upload Safe MIME Allowlist', () => {
    function createAdminEnv(): Env {
      const env = createMockEnv();
      env.DB.prepare = vi.fn().mockImplementation((query: string) => {
        if (query.includes('sessions')) {
          return {
            bind: () => ({
              first: async () => ({ id: 'usr_admin', email: 'admin@test.com', role: 'admin' })
            })
          };
        }
        return {
          bind: () => ({
            run: async () => ({ success: true })
          })
        };
      });
      return env;
    }

    it('rejects unsafe MIME types like text/html or scripts', async () => {
      const env = createAdminEnv();
      const formData = new FormData();
      const dangerousFile = new File(['<script>alert(1)</script>'], 'exploit.html', { type: 'text/html' });
      formData.append('file', dangerousFile);

      const res = await app.request('/api/products/admin/upload-file', {
        method: 'POST',
        headers: { Cookie: 'session=admin-session' },
        body: formData
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.error).toContain('Tipe file tidak diizinkan');
    });

    it('accepts safe MIME archive uploads (application/zip)', async () => {
      const env = createAdminEnv();
      const formData = new FormData();
      const validFile = new File([new Uint8Array([0x50, 0x4B, 0x03, 0x04])], 'goods.zip', { type: 'application/zip' });
      formData.append('file', validFile);

      const res = await app.request('/api/products/admin/upload-file', {
        method: 'POST',
        headers: { Cookie: 'session=admin-session' },
        body: formData
      }, env);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.r2_key).toContain('files/');
    });
  });

  describe('Issue 1: Credit Payment Provider Checkout Allowlist', () => {
    it('accepts credit as a valid payment provider during checkout', async () => {
      const env = createMockEnv();
      env.DB.prepare = vi.fn().mockImplementation((query: string) => {
        if (query.includes('sessions')) {
          return {
            bind: () => ({
              first: async () => ({ id: 'usr_test', email: 'user@test.com', role: 'user' })
            })
          };
        }
        if (query.includes('FROM products WHERE id = ?')) {
          return {
            bind: () => ({
              first: async () => ({ id: 'prd_code_1', name: 'Software Voucher', price: 25000, type: 'code', is_active: 1 })
            })
          };
        }
        if (query.includes('FROM stock_codes WHERE product_id = ?')) {
          return {
            bind: () => ({
              first: async () => ({ count: 10 })
            })
          };
        }
        if (query.includes('FROM orders WHERE id = ?')) {
          return {
            bind: () => ({
              first: async () => ({ id: 'ORD-123', user_id: 'usr_test', total_amount: 25000, payment_status: 'paid' })
            })
          };
        }
        if (query.includes('FROM order_items oi')) {
          return {
            bind: () => ({
              all: async () => ({
                results: [{
                  id: 'item_1',
                  order_id: 'ORD-123',
                  product_id: 'prd_code_1',
                  product_name: 'Software Voucher',
                  product_type: 'code',
                  price: 25000,
                  quantity: 1,
                  fulfilment_status: 'pending'
                }]
              })
            })
          };
        }
        if (query.includes('UPDATE stock_codes SET is_used = 1')) {
          return {
            bind: () => ({
              run: async () => ({ meta: { changes: 1 } })
            })
          };
        }
        if (query.includes('FROM stock_codes WHERE product_id = ? AND is_used = 0 LIMIT 1')) {
          return {
            bind: () => ({
              first: async () => ({ id: 'stk_1', code: 'KEY-123-456' })
            })
          };
        }
        return {
          bind: () => ({
            run: async () => ({ meta: { changes: 1 } }),
            first: async () => null,
            all: async () => ({ results: [] })
          })
        };
      });

      const res = await app.request('/api/orders/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=valid-user-session'
        },
        body: JSON.stringify({
          payment_provider: 'credit',
          items: [{ productId: 'prd_code_1', quantity: 1 }]
        })
      }, env);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.paymentProvider).toBe('credit');
      expect(json.totalAmount).toBe(25000);
    });
  });

  describe('Issue 5: Atomic Topup Processing and Changes Verification', () => {
    it('does not increment balance if claim update affects 0 rows', async () => {
      const env = createMockEnv();
      let credited = 0;
      const batchSpy = vi.fn(async (statements: any[]) => {
        // completeTopup uses a conditional batch. Emulate the D1 transaction
        // by applying the claim result before reporting the dependent steps.
        const claimResult = await statements[0].run();
        const claimChanges = claimResult?.meta?.changes ?? 0;
        if (claimChanges > 0) credited += 1;
        return [
          claimResult,
          { meta: { changes: claimChanges } },
          { meta: { changes: claimChanges } }
        ];
      });
      env.DB.batch = batchSpy;

      // Mock gateway Svix verification passing
      const { SumopodGateway } = await import('../src/services/payments');
      const origVerify = SumopodGateway.prototype.verifyWebhook;
      SumopodGateway.prototype.verifyWebhook = vi.fn().mockResolvedValue({
        orderId: 'TOPUP-CONCURRENT-001',
        status: 'paid',
        paymentId: 'pay_sumo_1',
        grossAmount: 50000
      });

      env.DB.prepare = vi.fn().mockImplementation((query: string) => {
        if (query.includes("SELECT id FROM credit_transactions WHERE reference_id = ? AND type = 'topup'")) {
          return {
            bind: () => ({
              first: async () => null // Not yet finished in previous check
            })
          };
        }
        if (query.includes("SELECT * FROM credit_transactions WHERE reference_id = ? AND type = 'topup_pending'")) {
          return {
            bind: () => ({
              first: async () => ({
                id: 'pending_1',
                user_id: 'usr_1',
                type: 'topup_pending',
                amount: 50000
              })
            })
          };
        }
        if (query.includes("UPDATE credit_transactions SET type = 'topup'")) {
          // Another concurrent worker claimed the row first: changes = 0
          return {
            bind: () => ({
              run: async () => ({ meta: { changes: 0 } })
            })
          };
        }
        return {
          bind: () => ({
            first: async () => null,
            run: async () => ({ meta: { changes: 0 } })
          })
        };
      });

      const res = await app.request('/api/webhooks/sumopod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'payment.completed' })
      }, env);

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.status).toBe('OK');
      expect(batchSpy).toHaveBeenCalledTimes(1);
      expect(credited).toBe(0);

      // Restore prototype
      SumopodGateway.prototype.verifyWebhook = origVerify;
    });
  });
});
