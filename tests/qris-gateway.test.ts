import { describe, expect, it, vi } from 'vitest';
import { QrisGateway, getPaymentGateway } from '../src/services/payments';

const options = {
  orderId: 'ORD-Q-123',
  amount: 25000.6,
  customerEmail: 'buyer@example.com',
  items: [{ id: 'product-1', name: 'Digital product', price: 25000.6, quantity: 1 }]
};

describe('QrisGateway', () => {
  it('creates a rounded QRIS transaction with the order reference', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: {
        qris_id: 'qris_123',
        trx_id: 'TRX-Q-123',
        qris_url: 'https://pay.example/qr/qris_123'
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const gateway = new QrisGateway('https://pay.example/', 'api-key');
      const result = await gateway.createTransaction(options);

      expect(fetchMock).toHaveBeenCalledWith('https://pay.example/create-qris', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'api-key'
        },
        body: JSON.stringify({ amount: 25001, reference_id: 'ORD-Q-123' })
      });
      expect(result.paymentId).toBe('qris_123');
      expect(result.redirectUrl).toBe('https://pay.example/qr/qris_123');
      expect(result.raw).toEqual({
        success: true,
        data: {
          qris_id: 'qris_123',
          trx_id: 'TRX-Q-123',
          qris_url: 'https://pay.example/qr/qris_123'
        }
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fails on an HTTP error or incomplete gateway response', async () => {
    const httpErrorFetch = vi.fn().mockResolvedValue(new Response('gateway failure', { status: 502 }));
    vi.stubGlobal('fetch', httpErrorFetch);
    try {
      await expect(new QrisGateway('https://pay.example', 'api-key').createTransaction(options))
        .rejects.toThrow('QRIS API error (502)');
    } finally {
      vi.unstubAllGlobals();
    }

    const incompleteFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { qris_id: 'qris_only' } }), { status: 200 }));
    vi.stubGlobal('fetch', incompleteFetch);
    try {
      await expect(new QrisGateway('https://pay.example', 'api-key').createTransaction(options))
        .rejects.toThrow('QRIS API response is missing transaction fields');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fails closed when the API key or webhook secret is missing', async () => {
    await expect(new QrisGateway('https://pay.example', '').createTransaction(options))
      .rejects.toThrow('QRIS API key is not configured');
    await expect(new QrisGateway('https://pay.example', 'api-key', '').verifyWebhook({}, {}))
      .rejects.toThrow('QRIS webhook secret is not configured');
  });

  it('authenticates callbacks and maps paid, failed, and pending states', async () => {
    const gateway = new QrisGateway('https://pay.example', 'api-key', 'webhook-secret');
    const basePayload = {
      reference_id: 'ORD-Q-123',
      qris_id: 'qris_123',
      trx_id: 'TRX-Q-123',
      amount: 25001,
      status: 'paid'
    };

    await expect(gateway.verifyWebhook(basePayload, { 'x-webhook-secret': 'wrong' }))
      .rejects.toThrow('Invalid QRIS webhook secret');
    await expect(gateway.verifyWebhook({ ...basePayload, status: 'paid' }, { 'x-webhook-secret': 'webhook-secret' }))
      .resolves.toMatchObject({ orderId: 'ORD-Q-123', paymentId: 'TRX-Q-123', grossAmount: 25001, status: 'paid' });
    await expect(gateway.verifyWebhook({ ...basePayload, status: 'EXPIRED', trx_id: undefined }, { 'x-webhook-secret': 'webhook-secret' }))
      .resolves.toMatchObject({ paymentId: 'qris_123', status: 'failed' });
    await expect(gateway.verifyWebhook({ ...basePayload, status: 'PENDING' }, { 'x-webhook-secret': 'webhook-secret' }))
      .resolves.toMatchObject({ status: 'pending' });
  });

  it('rejects unknown statuses, invalid amounts, and missing references', async () => {
    const gateway = new QrisGateway('https://pay.example', 'api-key', 'webhook-secret');
    const headers = { 'x-webhook-secret': 'webhook-secret' };
    const payload = { reference_id: 'ORD-Q-123', qris_id: 'qris_123', amount: 25000, status: 'paid' };

    await expect(gateway.verifyWebhook({ ...payload, reference_id: ' ' }, headers))
      .rejects.toThrow('Missing QRIS reference_id');
    await expect(gateway.verifyWebhook({ ...payload, status: 'settled' }, headers))
      .rejects.toThrow('Unknown QRIS webhook status');
    await expect(gateway.verifyWebhook({ ...payload, amount: 'not-a-number' }, headers))
      .rejects.toThrow('Invalid QRIS amount');
  });

  it('selects the QRIS adapter from the provider factory', () => {
    const gateway = getPaymentGateway('qris', {
      QRIS_API_BASE_URL: 'https://pay.example',
      QRIS_API_KEY: 'api-key',
      QRIS_WEBHOOK_SECRET: 'webhook-secret'
    });

    expect(gateway).toBeInstanceOf(QrisGateway);
    expect(gateway.name).toBe('qris');
  });
});
