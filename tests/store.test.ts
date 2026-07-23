import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/services/auth';
import { MidtransGateway, XenditGateway } from '../src/services/payments';
import { HeroSmsClient } from '../src/services/herosms';
import { checkRateLimit } from '../src/services/rate-limit';

describe('Digital Store Unit & Integration Tests', () => {
  it('should hash and verify passwords correctly using Web Crypto SHA-256', async () => {
    const password = 'SecretPassword123!';
    const hash = await hashPassword(password);
    
    expect(hash).toContain(':');
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword('WrongPassword', hash)).toBe(false);
  });

  it('should create and verify Midtrans webhook signature correctly', async () => {
    const serverKey = 'SB-Mid-server-TESTKEY123';
    const gateway = new MidtransGateway(serverKey);

    const orderId = 'ORD-123456';
    const statusCode = '200';
    const grossAmount = '50000.00';

    // Calculate valid SHA-512 signature
    const rawStr = `${orderId}${statusCode}${grossAmount}${serverKey}`;
    const encoder = new TextEncoder();
    const hashBuf = await crypto.subtle.digest('SHA-512', encoder.encode(rawStr));
    const signatureKey = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    const payload = {
      order_id: orderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: signatureKey,
      transaction_status: 'settlement'
    };

    const verified = await gateway.verifyWebhook(payload, {});
    expect(verified.orderId).toBe(orderId);
    expect(verified.status).toBe('paid');
  });

  it('should verify Xendit callback token correctly', async () => {
    const token = 'xendit_webhook_token_secret_999';
    const gateway = new XenditGateway('secret_key_123', token);

    const payload = {
      external_id: 'ORD-XENDIT-999',
      status: 'PAID',
      id: 'inv_12345'
    };

    const verified = await gateway.verifyWebhook(payload, { 'x-callback-token': token });
    expect(verified.orderId).toBe('ORD-XENDIT-999');
    expect(verified.status).toBe('paid');

    await expect(gateway.verifyWebhook(payload, { 'x-callback-token': 'wrong_token' }))
      .rejects.toThrow('Invalid Xendit callback token');
  });

  it('should request and poll HeroSMS status correctly in mock mode', async () => {
    const hero = new HeroSmsClient('', 'https://hero-sms.com/stubs/handler_api.php');
    const req = await hero.requestNumber('tg', '0');

    expect(req.activationId).toBeDefined();
    expect(req.phone).toContain('+628');

    const status = await hero.getStatus(req.activationId);
    expect(status.status).toBe('WAITING_CODE');
  });

  it('should handle rate limiting logic properly', async () => {
    const res1 = await checkRateLimit(undefined, 'ip_1', 10, 60);
    expect(res1.success).toBe(true);
  });
});
