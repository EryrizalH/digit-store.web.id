import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { Env } from '../src/types';

const { fulfillOrderMock, inAppNotificationMock, notificationWebhookMock } = vi.hoisted(() => ({
  fulfillOrderMock: vi.fn(),
  inAppNotificationMock: vi.fn(),
  notificationWebhookMock: vi.fn()
}));

vi.mock('../src/services/fulfilment', () => ({
  fulfillOrder: fulfillOrderMock
}));

vi.mock('../src/services/notifications', () => ({
  createInAppNotification: inAppNotificationMock,
  sendNotificationWebhook: notificationWebhookMock
}));

type Statement = {
  bind: (...args: unknown[]) => Statement;
  first: () => Promise<unknown>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

function statement(firstValue: unknown = null, changes = 1): Statement {
  const stmt = {} as Statement;
  stmt.bind = vi.fn(() => stmt);
  stmt.first = vi.fn(async () => firstValue);
  stmt.run = vi.fn(async () => ({ success: true, meta: { changes } }));
  return stmt;
}

function createEnv(prepare: (query: string) => Statement): Env {
  const db = {
    prepare: vi.fn(prepare),
    batch: vi.fn(async () => [])
  } as unknown as D1Database;
  return {
    DB: db,
    FILES_BUCKET: {} as R2Bucket,
    RATE_LIMIT_KV: {} as KVNamespace,
    ASSETS: {} as Fetcher,
    QRIS_WEBHOOK_SECRET: 'test-qris-secret',
    APP_URL: 'https://digit-store.example'
  };
}

function qrisRequest(payload: unknown, env: Env, secret = 'test-qris-secret') {
  return app.request('/api/webhooks/qris', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': secret
    },
    body: JSON.stringify(payload)
  }, env);
}

const paidOrderPayload = {
  event: 'payment.paid',
  reference_id: 'ORD-Q-001',
  qris_id: 'qris_001',
  trx_id: 'TRX-Q-001',
  amount: 25000,
  status: 'paid'
};

describe('QRIS webhook route', () => {
  beforeEach(() => {
    fulfillOrderMock.mockReset().mockResolvedValue({ success: true, message: 'ok' });
    inAppNotificationMock.mockReset().mockResolvedValue(undefined);
    notificationWebhookMock.mockReset().mockResolvedValue(undefined);
  });

  it('rejects malformed JSON before authentication or database work', async () => {
    const env = createEnv(vi.fn(() => statement()));
    const response = await app.request('/api/webhooks/qris', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': 'test-qris-secret'
      },
      body: '{bad json'
    }, env);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Malformed JSON payload' });
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });

  it('rejects a missing or wrong webhook secret', async () => {
    const env = createEnv(vi.fn(() => statement()));
    const response = await qrisRequest(paidOrderPayload, env, 'wrong-secret');

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid QRIS webhook secret' });
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });

  it('rejects a callback without a reference id', async () => {
    const env = createEnv(vi.fn(() => statement()));
    const response = await qrisRequest({ ...paidOrderPayload, reference_id: '' }, env);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Missing QRIS reference_id' });
  });

  it('marks a QRIS order paid once and ignores a duplicate callback', async () => {
    let transitionClaimed = false;
    const order = {
      id: 'ORD-Q-001',
      user_id: 'usr_qris',
      total_amount: 25000,
      payment_provider: 'qris',
      payment_status: 'pending'
    };
    const prepare = vi.fn((query: string) => {
      if (query.includes('SELECT * FROM orders WHERE id = ?')) {
        return statement(order);
      }
      if (query.includes('UPDATE') && query.includes('orders')) {
        const update = statement();
        update.run = vi.fn(async () => {
          if (transitionClaimed) return { success: true, meta: { changes: 0 } };
          transitionClaimed = true;
          return { success: true, meta: { changes: 1 } };
        });
        return update;
      }
      return statement();
    });
    const env = createEnv(prepare);

    const first = await qrisRequest(paidOrderPayload, env);
    const second = await qrisRequest(paidOrderPayload, env);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fulfillOrderMock).toHaveBeenCalledTimes(1);
    expect(inAppNotificationMock).toHaveBeenCalledTimes(1);
    expect(notificationWebhookMock).toHaveBeenCalledTimes(1);
  });

  it('rejects order amount and provider mismatches without fulfilment', async () => {
    const qrisOrder = {
      id: 'ORD-Q-001',
      user_id: 'usr_qris',
      total_amount: 25000,
      payment_provider: 'qris',
      payment_status: 'pending'
    };
    const amountEnv = createEnv((query) => query.includes('SELECT * FROM orders WHERE id = ?') ? statement(qrisOrder) : statement());
    const amountResponse = await qrisRequest({ ...paidOrderPayload, amount: 24000 }, amountEnv);

    const providerOrder = { ...qrisOrder, payment_provider: 'midtrans' };
    const providerEnv = createEnv((query) => query.includes('SELECT * FROM orders WHERE id = ?') ? statement(providerOrder) : statement());
    const providerResponse = await qrisRequest(paidOrderPayload, providerEnv);

    expect(amountResponse.status).toBe(400);
    expect(await amountResponse.json()).toEqual({ error: 'Payment amount mismatch' });
    expect(providerResponse.status).toBe(400);
    expect(await providerResponse.json()).toEqual({ error: 'Payment provider mismatch' });
    expect(fulfillOrderMock).not.toHaveBeenCalled();
  });

  it('credits a pending QRIS topup once when duplicate callbacks race', async () => {
    let claimAvailable = true;
    let credited = 0;
    const topupPayload = { ...paidOrderPayload, reference_id: 'TOPUP-Q-001', amount: 50000 };
    const prepare = vi.fn((query: string) => {
      if (query.includes('SELECT * FROM credit_transactions') && query.includes('type = "topup"')) {
        return statement(null);
      }
      if (query.includes('SELECT * FROM credit_transactions') && query.includes('type = "topup_pending"')) {
        return statement({ id: 'pending_1', user_id: 'usr_qris', amount: 50000 });
      }
      if (query.includes('UPDATE') && query.includes('credit_transactions')) {
        const update = statement();
        update.run = vi.fn(async () => {
          if (!claimAvailable) return { success: true, meta: { changes: 0 } };
          claimAvailable = false;
          return { success: true, meta: { changes: 1 } };
        });
        return update;
      }
      return statement();
    });
    const env = createEnv(prepare);
    env.DB.batch = vi.fn(async () => {
      credited += 1;
      return [];
    });

    const first = await qrisRequest(topupPayload, env);
    const second = await qrisRequest(topupPayload, env);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(credited).toBe(1);
    expect(fulfillOrderMock).not.toHaveBeenCalled();
  });
});
