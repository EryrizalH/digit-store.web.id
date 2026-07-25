import { describe, it, expect } from 'vitest';
import { SumopodGateway } from '../src/services/payments';

describe('Credit System & Sumopod Gateway Tests', () => {
  describe('SumopodGateway', () => {
    it('should return mock payment link when API key is empty', async () => {
      const gateway = new SumopodGateway('', false);
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

    it('should skip signature verification when no webhook secret is set', async () => {
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

      const result = await gateway.verifyWebhook(payload, {});
      expect(result.orderId).toBe('ORD-REGULAR-001');
      expect(result.status).toBe('paid');
    });

    it('should map payment.failed event to failed status', async () => {
      const gateway = new SumopodGateway('test-key', false, '');

      const payload = {
        event_type: 'payment.failed',
        data: {
          payment_id: 'pay_789',
          order_id: 'ORD-FAIL-001',
          amount: 25000,
          status: 'failed'
        }
      };

      const result = await gateway.verifyWebhook(payload, {});
      expect(result.status).toBe('failed');
    });

    it('should map payment.expired event to failed status', async () => {
      const gateway = new SumopodGateway('test-key', false, '');

      const payload = {
        event_type: 'payment.expired',
        data: {
          payment_id: 'pay_expired',
          order_id: 'ORD-EXPIRED-001',
          amount: 75000,
          status: 'expired'
        }
      };

      const result = await gateway.verifyWebhook(payload, {});
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
  });

  describe('Credit Service Functions', () => {
    // Mock D1Database for unit testing credit service logic
    function createMockDb(data: { balance?: number; transactions?: any[] } = {}) {
      let currentBalance = data.balance ?? 0;
      const transactions: any[] = data.transactions ?? [];

      return {
        prepare: (sql: string) => ({
          bind: (...args: any[]) => ({
            first: async <T = any>(): Promise<T | null> => {
              if (sql.includes('SELECT balance FROM user_credits')) {
                return currentBalance > 0 ? { balance: currentBalance } as any : null;
              }
              if (sql.includes('SELECT * FROM credit_transactions') || sql.includes('SELECT id FROM credit_transactions')) {
                return transactions.find(t => t.reference_id === args[0]) || null;
              }
              return null;
            },
            run: async () => {
              if (sql.includes('INSERT INTO user_credits') || sql.includes('ON CONFLICT')) {
                currentBalance += Number(args[1] || args[2] || 0);
              }
              if (sql.includes('UPDATE user_credits SET balance = balance -')) {
                // Atomic debit: check balance >= amount before decrementing
                const debitAmount = Number(args[0]);
                if (currentBalance >= debitAmount) {
                  currentBalance -= debitAmount;
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              return { meta: { changes: 1 } };
            },
            all: async () => ({ results: transactions })
          })
        })
      } as unknown as D1Database;
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

    it('should debit credit when balance is sufficient', async () => {
      const { debitCredit } = await import('../src/services/credits');
      const db = createMockDb({ balance: 100000 });
      const result = await debitCredit(db, 'user_123', 50000, 'ORD-001', 'Order payment');

      expect(result.success).toBe(true);
      expect(result.transaction).toBeDefined();
      expect(result.transaction!.type).toBe('debit');
      expect(result.transaction!.amount).toBe(50000);
    });

    it('should fail debit when balance is insufficient', async () => {
      const { debitCredit } = await import('../src/services/credits');
      const db = createMockDb({ balance: 5000 });
      const result = await debitCredit(db, 'user_123', 50000, 'ORD-001', 'Order payment');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient credit balance');
      expect(result.transaction).toBeUndefined();
    });

    it('should refund credit successfully', async () => {
      const { refundCredit } = await import('../src/services/credits');
      const db = createMockDb({ balance: 50000 });
      const txn = await refundCredit(db, 'user_123', 25000, 'refund-item_001', 'Auto-refund for failed item');

      expect(txn.type).toBe('refund');
      expect(txn.amount).toBe(25000);
      expect(txn.reference_id).toBe('refund-item_001');
    });
  });
});
