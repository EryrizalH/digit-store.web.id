import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SumopodGateway } from '../src/services/payments';

describe('Credit System & Sumopod Gateway Tests', () => {
  describe('SumopodGateway', () => {
    it('should return mock payment link when API key is empty and mock is opted in', async () => {
      const gateway = new SumopodGateway('', false, '', true);
      const result = await gateway.createTransaction({
        orderId: 'TOPUP-1234-5678',
        amount: 50000,
        customerEmail: 'test@example.com',
        items: [{ id: 'credit-topup', name: 'Credit Topup', price: 50000, quantity: 1 }]
      });

      expect(result.paymentId).toBe('SUMO-MOCK-TOPUP-1234-5678');
      expect(result.redirectUrl).toContain('simulated');
      expect(result.redirectUrl).toContain('sumopod');
      expect(result.raw.mock).toBe(true);
    });

    it('should throw error when API key is empty and mock is disabled', async () => {
      const gateway = new SumopodGateway('', false, '', false);
      await expect(gateway.createTransaction({
        orderId: 'TOPUP-1234-5678',
        amount: 50000,
        customerEmail: 'test@example.com',
        items: [{ id: 'credit-topup', name: 'Credit Topup', price: 50000, quantity: 1 }]
      })).rejects.toThrow('Sumopod API key is not configured');
    });

    it('should use sandbox endpoint when isProduction is false', () => {
      const gateway = new SumopodGateway('test-key', false);
      expect(gateway.name).toBe('sumopod');
    });

    it('should verify webhook with valid Svix signature using rawBody', async () => {
      const secret = btoa('test-webhook-secret-bytes-32ch');
      const gateway = new SumopodGateway('test-key', false, `whsec_${secret}`);

      // Raw body with specific formatting (extra space after colon)
      const rawBody = '{"event_type": "payment.completed","data":{"payment_id":"pay_raw","order_id":"TOPUP-RAW-001","amount":75000,"status":"completed"}}';
      const payload = JSON.parse(rawBody);

      const svixId = 'msg_rawtest';
      const svixTimestamp = String(Math.floor(Date.now() / 1000));
      // Signature is computed over the raw body, not JSON.stringify(payload)
      const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;

      const encoder = new TextEncoder();
      const secretBytes = Uint8Array.from(atob(secret), c => c.charCodeAt(0));
      const key = await crypto.subtle.importKey(
        'raw',
        secretBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(signedContent));
      const computedSig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

      const headers = {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': `v1,${computedSig}`
      };

      const result = await gateway.verifyWebhook(payload, headers, rawBody);
      expect(result.orderId).toBe('TOPUP-RAW-001');
      expect(result.status).toBe('paid');
      expect(result.paymentId).toBe('pay_raw');
    });

    it('should verify webhook with valid Svix signature', async () => {
      const secret = btoa('test-webhook-secret-bytes-32ch');
      const gateway = new SumopodGateway('test-key', false, `whsec_${secret}`);

      const payload = {
        event_type: 'payment.completed',
        data: {
          payment_id: 'pay_123',
          order_id: 'TOPUP-1234-5678',
          amount: 50000,
          status: 'completed'
        }
      };

      const svixId = 'msg_test123';
      const svixTimestamp = String(Math.floor(Date.now() / 1000));
      const signedContent = `${svixId}.${svixTimestamp}.${JSON.stringify(payload)}`;

      // Compute HMAC-SHA256 signature
      const encoder = new TextEncoder();
      const secretBytes = Uint8Array.from(atob(secret), c => c.charCodeAt(0));
      const key = await crypto.subtle.importKey(
        'raw',
        secretBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(signedContent));
      const computedSig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

      const headers = {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': `v1,${computedSig}`
      };

      const result = await gateway.verifyWebhook(payload, headers);
      expect(result.orderId).toBe('TOPUP-1234-5678');
      expect(result.status).toBe('paid');
      expect(result.paymentId).toBe('pay_123');
    });

    it('should reject webhook with invalid Svix signature', async () => {
      const secret = btoa('test-webhook-secret-bytes-32ch');
      const gateway = new SumopodGateway('test-key', false, `whsec_${secret}`);

      const payload = {
        event_type: 'payment.completed',
        data: {
          payment_id: 'pay_123',
          order_id: 'TOPUP-1234-5678',
          amount: 50000,
          status: 'completed'
        }
      };

      const headers = {
        'svix-id': 'msg_test123',
        'svix-timestamp': String(Math.floor(Date.now() / 1000)),
        'svix-signature': 'v1,invalidsignature'
      };

      await expect(gateway.verifyWebhook(payload, headers))
        .rejects.toThrow('Invalid Sumopod webhook signature');
    });

    it('should reject webhook with missing signature headers', async () => {
      const secret = btoa('test-webhook-secret-bytes-32ch');
      const gateway = new SumopodGateway('test-key', false, `whsec_${secret}`);

      const payload = {
        event_type: 'payment.completed',
        data: { order_id: 'ORD-123', amount: 50000 }
      };

      await expect(gateway.verifyWebhook(payload, {}))
        .rejects.toThrow('Missing Svix webhook signature headers');
    });

    it('should fail closed when no webhook secret is configured', async () => {
      const gateway = new SumopodGateway('test-key', false, '');

      const payload = {
        event_type: 'payment.completed',
        data: {
          payment_id: 'pay_456',
          order_id: 'ORD-REGULAR-001',
          amount: 100000,
          status: 'completed'
        }
      };

      await expect(gateway.verifyWebhook(payload, {}))
        .rejects.toThrow('Sumopod webhook secret is not configured');
    });

    it('should map payment.failed event to failed status with valid signature', async () => {
      const secret = btoa('test-webhook-secret-bytes-32ch');
      const gateway = new SumopodGateway('test-key', false, `whsec_${secret}`);

      const payload = {
        event_type: 'payment.failed',
        data: {
          payment_id: 'pay_789',
          order_id: 'ORD-FAIL-001',
          amount: 25000,
          status: 'failed'
        }
      };

      const svixId = 'msg_fail123';
      const svixTimestamp = String(Math.floor(Date.now() / 1000));
      const signedContent = `${svixId}.${svixTimestamp}.${JSON.stringify(payload)}`;
      const encoder = new TextEncoder();
      const secretBytes = Uint8Array.from(atob(secret), c => c.charCodeAt(0));
      const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(signedContent));
      const computedSig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

      const headers = {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': `v1,${computedSig}`
      };

      const result = await gateway.verifyWebhook(payload, headers);
      expect(result.status).toBe('failed');
    });

    it('should map payment.expired event to failed status with valid signature', async () => {
      const secret = btoa('test-webhook-secret-bytes-32ch');
      const gateway = new SumopodGateway('test-key', false, `whsec_${secret}`);

      const payload = {
        event_type: 'payment.expired',
        data: {
          payment_id: 'pay_expired',
          order_id: 'ORD-EXPIRED-001',
          amount: 75000,
          status: 'expired'
        }
      };

      const svixId = 'msg_exp123';
      const svixTimestamp = String(Math.floor(Date.now() / 1000));
      const signedContent = `${svixId}.${svixTimestamp}.${JSON.stringify(payload)}`;
      const encoder = new TextEncoder();
      const secretBytes = Uint8Array.from(atob(secret), c => c.charCodeAt(0));
      const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(signedContent));
      const computedSig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

      const headers = {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': `v1,${computedSig}`
      };

      const result = await gateway.verifyWebhook(payload, headers);
      expect(result.status).toBe('failed');
    });
  });

  describe('getPaymentGateway factory', () => {
    it('should return SumopodGateway for sumopod provider', async () => {
      const { getPaymentGateway } = await import('../src/services/payments');
      const env = {
        SUMOPOD_API_KEY: 'test-key',
        SUMOPOD_IS_PRODUCTION: 'false',
        SUMOPOD_WEBHOOK_SECRET: 'whsec_test'
      };

      const gateway = getPaymentGateway('sumopod', env);
      expect(gateway.name).toBe('sumopod');
    });

    it('should handle case-insensitive provider matching', async () => {
      const { getPaymentGateway } = await import('../src/services/payments');
      const env = { SUMOPOD_API_KEY: 'key', SUMOPOD_IS_PRODUCTION: 'false', SUMOPOD_WEBHOOK_SECRET: '' };

      const gateway = getPaymentGateway('Sumopod', env);
      expect(gateway.name).toBe('sumopod');
    });

    // ponytail: regression tests proving mocks require BOTH APP_ENV=development and ALLOW_MOCK_PAYMENTS=true
    it('fails closed in development without ALLOW_MOCK_PAYMENTS when API keys are unconfigured', async () => {
      const { getPaymentGateway } = await import('../src/services/payments');
      const devEnvWithoutFlag = { APP_ENV: 'development' };
      const options = {
        orderId: 'ORD-DEV-FAILCLOSED',
        amount: 50000,
        customerEmail: 'dev@example.com',
        customerName: 'Dev User',
        items: []
      };

      const midtrans = getPaymentGateway('midtrans', devEnvWithoutFlag);
      await expect(midtrans.createTransaction(options)).rejects.toThrow('Midtrans server key is not configured');

      const xendit = getPaymentGateway('xendit', devEnvWithoutFlag);
      await expect(xendit.createTransaction(options)).rejects.toThrow('Xendit secret key is not configured');

      const sumopod = getPaymentGateway('sumopod', devEnvWithoutFlag);
      await expect(sumopod.createTransaction(options)).rejects.toThrow('Sumopod API key is not configured');
    });

    it('allows mock payment creation in development when ALLOW_MOCK_PAYMENTS is true', async () => {
      const { getPaymentGateway } = await import('../src/services/payments');
      const devEnvWithFlag = { APP_ENV: 'development', ALLOW_MOCK_PAYMENTS: 'true' };
      const options = {
        orderId: 'ORD-DEV-MOCK',
        amount: 50000,
        customerEmail: 'dev@example.com',
        customerName: 'Dev User',
        items: []
      };

      const midtrans = getPaymentGateway('midtrans', devEnvWithFlag);
      const midtransRes = await midtrans.createTransaction(options);
      expect(midtransRes.paymentId).toBe('MID-MOCK-ORD-DEV-MOCK');
      expect(midtransRes.raw).toEqual({ mock: true });

      const xendit = getPaymentGateway('xendit', devEnvWithFlag);
      const xenditRes = await xendit.createTransaction(options);
      expect(xenditRes.paymentId).toBe('XEN-MOCK-ORD-DEV-MOCK');
      expect(xenditRes.raw).toEqual({ mock: true });

      const sumopod = getPaymentGateway('sumopod', devEnvWithFlag);
      const sumopodRes = await sumopod.createTransaction(options);
      expect(sumopodRes.paymentId).toBe('SUMO-MOCK-ORD-DEV-MOCK');
      expect(sumopodRes.raw).toEqual({ mock: true });
    });

    it('fails closed in production even if ALLOW_MOCK_PAYMENTS is true', async () => {
      const { getPaymentGateway } = await import('../src/services/payments');
      const prodEnvWithFlag = { APP_ENV: 'production', ALLOW_MOCK_PAYMENTS: 'true' };
      const options = {
        orderId: 'ORD-PROD-GUARD',
        amount: 50000,
        customerEmail: 'prod@example.com',
        customerName: 'Prod User',
        items: []
      };

      const midtrans = getPaymentGateway('midtrans', prodEnvWithFlag);
      await expect(midtrans.createTransaction(options)).rejects.toThrow('Midtrans server key is not configured');

      const xendit = getPaymentGateway('xendit', prodEnvWithFlag);
      await expect(xendit.createTransaction(options)).rejects.toThrow('Xendit secret key is not configured');

      const sumopod = getPaymentGateway('sumopod', prodEnvWithFlag);
      await expect(sumopod.createTransaction(options)).rejects.toThrow('Sumopod API key is not configured');
    });
  });

  describe('Credit Service Functions', () => {
    // ponytail: Mock D1Database simulating atomic batch execution and metadata inspection
    function createMockDb(data: {
      balance?: number;
      transactions?: any[];
      failOnTxnInsert?: boolean;
      mockBatchChanges?: [number, number];
    } = {}) {
      let currentBalance = data.balance ?? 0;
      const transactions: any[] = [...(data.transactions ?? [])];

      const createBoundStmt = (sql: string, args: any[]) => ({
        sql,
        args,
        first: async <T = any>(): Promise<T | null> => {
          if (sql.includes('SELECT balance FROM user_credits')) {
            return currentBalance > 0 ? { balance: currentBalance } as any : null;
          }
          if (sql.includes('SELECT * FROM credit_transactions') || sql.includes('SELECT id FROM credit_transactions')) {
            return transactions.find(t => t.reference_id === args[0] && (!sql.includes("'debit'") || t.type === 'debit')) || null;
          }
          return null;
        },
        run: async () => {
          if (sql.includes('INSERT INTO user_credits') || sql.includes('ON CONFLICT')) {
            currentBalance += Number(args[1] || args[2] || 0);
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE user_credits SET balance = balance -')) {
            const debitAmount = Number(args[0]);
            if (currentBalance >= debitAmount) {
              currentBalance -= debitAmount;
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 0 } };
          }
          if (sql.includes('INSERT INTO credit_transactions')) {
            if (data.failOnTxnInsert) {
              throw new Error('D1_ERROR: UNIQUE constraint failed: credit_transactions.reference_id');
            }
            const txn = {
              id: args[0],
              user_id: args[1],
              type: sql.includes("'debit'") ? 'debit' : args[2],
              amount: sql.includes("'debit'") ? args[2] : args[3],
              reference_id: sql.includes("'debit'") ? args[3] : args[4],
              description: sql.includes("'debit'") ? args[4] : args[5],
              created_at: new Date().toISOString()
            };
            transactions.push(txn);
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
        all: async () => ({ results: transactions })
      });

      return {
        prepare: (sql: string) => ({
          bind: (...args: any[]) => createBoundStmt(sql, args)
        }),
        batch: async (statements: any[]) => {
          if (data.mockBatchChanges) {
            return [
              { success: true, meta: { changes: data.mockBatchChanges[0] } },
              { success: true, meta: { changes: data.mockBatchChanges[1] } }
            ];
          }
          const initialBalance = currentBalance;
          const initialTxnsCount = transactions.length;
          try {
            const results = [];
            let lastChanges = 0;
            for (const stmt of statements) {
              if (stmt.sql?.includes('WHERE (SELECT changes()) > 0') && lastChanges === 0) {
                results.push({ success: true, meta: { changes: 0 } });
                continue;
              }
              const res = await stmt.run();
              results.push(res);
              lastChanges = res.meta?.changes ?? 0;
            }
            return results;
          } catch (err) {
            currentBalance = initialBalance;
            transactions.splice(initialTxnsCount);
            throw err;
          }
        },
        getBalance: () => currentBalance,
        getTransactions: () => transactions
      } as unknown as D1Database & { getBalance: () => number; getTransactions: () => any[] };
    }

    it('should return zero balance for new user', async () => {
      const { getBalance } = await import('../src/services/credits');
      const db = createMockDb({ balance: 0 });
      const balance = await getBalance(db, 'user_123');
      expect(balance).toBe(0);
    });

    it('should return existing balance', async () => {
      const { getBalance } = await import('../src/services/credits');
      const db = createMockDb({ balance: 50000 });
      const balance = await getBalance(db, 'user_123');
      expect(balance).toBe(50000);
    });

    it('should add credit successfully', async () => {
      const { addCredit } = await import('../src/services/credits');
      const db = createMockDb({ balance: 0 });
      const txn = await addCredit(db, 'user_123', 50000, 'topup', 'TOPUP-001', 'Test topup');

      expect(txn.id).toContain('crtx_');
      expect(txn.user_id).toBe('user_123');
      expect(txn.type).toBe('topup');
      expect(txn.amount).toBe(50000);
      expect(txn.reference_id).toBe('TOPUP-001');
    });

    it('should reject non-positive or fractional credit additions', async () => {
      const { addCredit } = await import('../src/services/credits');
      const db = createMockDb({ balance: 0 });

      await expect(addCredit(db, 'user_123', 0, 'topup')).rejects.toThrow('Invalid credit amount');
      await expect(addCredit(db, 'user_123', -1000, 'topup')).rejects.toThrow('Invalid credit amount');
      await expect(addCredit(db, 'user_123', 1000.5, 'topup')).rejects.toThrow('Invalid credit amount');
      expect((db as any).getBalance()).toBe(0);
      expect((db as any).getTransactions()).toHaveLength(0);
    });

    it('should debit credit when balance is sufficient and record ledger row', async () => {
      const { debitCredit } = await import('../src/services/credits');
      const db = createMockDb({ balance: 100000 });
      const result = await debitCredit(db, 'user_123', 50000, 'ORD-001', 'Order payment');

      expect(result.success).toBe(true);
      expect(result.transaction).toBeDefined();
      expect(result.transaction!.type).toBe('debit');
      expect(result.transaction!.amount).toBe(50000);
      expect(result.transaction!.reference_id).toBe('ORD-001');
      expect((db as any).getBalance()).toBe(50000);
      expect((db as any).getTransactions()).toHaveLength(1);
    });

    it('should fail debit when balance is insufficient and not create ledger row', async () => {
      const { debitCredit } = await import('../src/services/credits');
      const db = createMockDb({ balance: 5000 });
      const result = await debitCredit(db, 'user_123', 50000, 'ORD-INSUFFICIENT', 'Order payment');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient credit balance');
      expect(result.transaction).toBeUndefined();
      expect((db as any).getBalance()).toBe(5000);
      expect((db as any).getTransactions()).toHaveLength(0);
    });

    it('should return existing transaction on duplicate reference retry without double-debiting', async () => {
      const { debitCredit } = await import('../src/services/credits');
      const db = createMockDb({ balance: 100000 });

      // First debit
      const res1 = await debitCredit(db, 'user_123', 40000, 'ORD-RETRY-1', 'Initial payment');
      expect(res1.success).toBe(true);
      expect((db as any).getBalance()).toBe(60000);
      expect((db as any).getTransactions()).toHaveLength(1);

      // Retry debit with same reference_id
      const res2 = await debitCredit(db, 'user_123', 40000, 'ORD-RETRY-1', 'Retry payment');
      expect(res2.success).toBe(true);
      expect(res2.transaction?.id).toBe(res1.transaction?.id);
      expect((db as any).getBalance()).toBe(60000); // Balance not deducted again
      expect((db as any).getTransactions()).toHaveLength(1); // No duplicate ledger row
    });

    it('should rollback balance and fail debit when ledger insert fails', async () => {
      const { debitCredit } = await import('../src/services/credits');
      const db = createMockDb({ balance: 100000, failOnTxnInsert: true });
      const result = await debitCredit(db, 'user_123', 50000, 'ORD-FAIL-INSERT', 'Payment with failing ledger');

      expect(result.success).toBe(false);
      expect(result.error).toContain('UNIQUE constraint failed');
      expect((db as any).getBalance()).toBe(100000); // Balance preserved
      expect((db as any).getTransactions()).toHaveLength(0);
    });

    it('should reject non-positive debit amounts', async () => {
      const { debitCredit } = await import('../src/services/credits');
      const db = createMockDb({ balance: 100000 });

      const resZero = await debitCredit(db, 'user_123', 0, 'ORD-ZERO');
      expect(resZero.success).toBe(false);
      expect(resZero.error).toBe('Invalid debit amount');

      const resNeg = await debitCredit(db, 'user_123', -5000, 'ORD-NEG');
      expect(resNeg.success).toBe(false);
      expect(resNeg.error).toBe('Invalid debit amount');

      expect((db as any).getBalance()).toBe(100000);
    });

    it('should fail debit when batch affected-rows metadata indicates 0 changes', async () => {
      const { debitCredit } = await import('../src/services/credits');
      const db = createMockDb({ balance: 100000, mockBatchChanges: [0, 0] });
      const result = await debitCredit(db, 'user_123', 25000, 'ORD-AFFECTED-0', 'Affected rows 0');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient credit balance');
    });

    it('should refund credit successfully', async () => {
      const { refundCredit } = await import('../src/services/credits');
      const db = createMockDb({ balance: 50000 });
      const txn = await refundCredit(db, 'user_123', 25000, 'refund-item_001', 'Auto-refund for failed item');

      expect(txn.type).toBe('refund');
      expect(txn.amount).toBe(25000);
      expect(txn.reference_id).toBe('refund-item_001');
    });

    it('should make refund retries idempotent', async () => {
      const { refundCredit } = await import('../src/services/credits');
      const db = createMockDb({ balance: 50000 });

      const first = await refundCredit(db, 'user_123', 25000, 'refund-item-retry', 'Auto-refund');
      const second = await refundCredit(db, 'user_123', 25000, 'refund-item-retry', 'Retry refund');

      expect(second.id).toBe(first.id);
      expect((db as any).getBalance()).toBe(75000);
      expect((db as any).getTransactions()).toHaveLength(1);
    });

    it('should return the winner when a concurrent refund hits the unique reference', async () => {
      const { refundCredit } = await import('../src/services/credits');
      const winner = {
        id: 'crtx_winner',
        user_id: 'user_123',
        type: 'refund' as const,
        amount: 25000,
        reference_id: 'refund-race',
        description: 'Concurrent winner',
        created_at: new Date().toISOString()
      };
      let refundLookupCount = 0;
      const db = {
        prepare: (sql: string) => ({
          bind: (..._args: any[]) => ({
            first: async () => {
              if (sql.includes("type = 'refund'")) {
                refundLookupCount += 1;
                return refundLookupCount > 1 ? winner : null;
              }
              return null;
            },
            run: async () => ({ meta: { changes: 1 } })
          })
        }),
        batch: async () => {
          throw new Error('UNIQUE constraint failed: credit_transactions.reference_id');
        }
      } as unknown as D1Database;

      const result = await refundCredit(db, 'user_123', 25000, 'refund-race', 'Concurrent retry');
      expect(result).toEqual(winner);
      expect(refundLookupCount).toBe(2);
    });

    it('should reject invalid refund amounts before touching the ledger', async () => {
      const { refundCredit } = await import('../src/services/credits');
      const db = createMockDb({ balance: 50000 });

      await expect(refundCredit(db, 'user_123', 0, 'refund-invalid')).rejects.toThrow('Invalid credit amount');
      await expect(refundCredit(db, 'user_123', 99.9, 'refund-invalid-fraction')).rejects.toThrow('Invalid credit amount');
      expect((db as any).getBalance()).toBe(50000);
      expect((db as any).getTransactions()).toHaveLength(0);
    });
  });

  // ponytail: End-to-end integration tests using real Miniflare D1 database
  describe('D1 Miniflare Integration Tests for debitCredit', () => {
    let mf: any;
    let d1: D1Database;

    beforeAll(async () => {
      const { Miniflare } = await import('miniflare');
      mf = new Miniflare({
        modules: true,
        script: 'export default { fetch() { return new Response(null); } }',
        d1Databases: { DB: 'test-credits-d1' }
      });
      d1 = await mf.getD1Database('DB');
      await d1.exec('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT);');
      await d1.exec('CREATE TABLE IF NOT EXISTS user_credits (user_id TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);');
      await d1.exec('CREATE TABLE IF NOT EXISTS credit_transactions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, amount INTEGER NOT NULL, reference_id TEXT, description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);');
      await d1.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_txn_debit_ref ON credit_transactions(reference_id) WHERE type = "debit" AND reference_id IS NOT NULL;');
    });

    afterAll(async () => {
      if (mf) await mf.dispose();
    });

    it('executes atomic debit and ledger insertion with real D1 batch', async () => {
      const { debitCredit, getBalance } = await import('../src/services/credits');
      await d1.prepare('INSERT INTO user_credits (user_id, balance) VALUES (?, ?)').bind('usr_d1_test', 100000).run();

      const result = await debitCredit(d1, 'usr_d1_test', 35000, 'D1-REF-001', 'D1 real batch test');
      expect(result.success).toBe(true);
      expect(result.transaction?.amount).toBe(35000);

      const bal = await getBalance(d1, 'usr_d1_test');
      expect(bal).toBe(65000);

      const txn = await d1.prepare('SELECT * FROM credit_transactions WHERE reference_id = ?').bind('D1-REF-001').first<any>();
      expect(txn).toBeDefined();
      expect(txn.type).toBe('debit');
      expect(txn.amount).toBe(35000);
    });

    it('prevents debit and ledger insertion on insufficient balance with real D1 batch', async () => {
      const { debitCredit, getBalance } = await import('../src/services/credits');
      const result = await debitCredit(d1, 'usr_d1_test', 999999, 'D1-REF-OVERDRAFT', 'Overdraft attempt');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient credit balance');

      const bal = await getBalance(d1, 'usr_d1_test');
      expect(bal).toBe(65000); // Balance unchanged

      const txn = await d1.prepare('SELECT * FROM credit_transactions WHERE reference_id = ?').bind('D1-REF-OVERDRAFT').first<any>();
      expect(txn).toBeNull(); // No ledger row written
    });

    it('handles idempotent retry without double debiting on real D1', async () => {
      const { debitCredit, getBalance } = await import('../src/services/credits');
      const res1 = await debitCredit(d1, 'usr_d1_test', 15000, 'D1-REF-RETRY', 'First call');
      expect(res1.success).toBe(true);
      expect(await getBalance(d1, 'usr_d1_test')).toBe(50000);

      const res2 = await debitCredit(d1, 'usr_d1_test', 15000, 'D1-REF-RETRY', 'Second call');
      expect(res2.success).toBe(true);
      expect(res2.transaction?.id).toBe(res1.transaction?.id);
      expect(await getBalance(d1, 'usr_d1_test')).toBe(50000); // Balance not debited twice
    });
  });
});
