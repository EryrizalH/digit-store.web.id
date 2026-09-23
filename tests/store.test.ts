import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/services/auth';
import { MidtransGateway, XenditGateway, SumopodGateway } from '../src/services/payments';
import { HeroSmsClient } from '../src/services/herosms';
import { checkRateLimit } from '../src/services/rate-limit';

describe('Digital Store Unit & Integration Tests', () => {
  // ponytail: WebCrypto PBKDF2 and legacy SHA-256 fallback password verification
  it('should hash and verify passwords correctly using PBKDF2 and legacy SHA-256 fallback', async () => {
    const password = 'SecretPassword123!';
    const hash = await hashPassword(password);
    
    expect(hash.startsWith('pbkdf2:v1:100000:')).toBe(true);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword('WrongPassword', hash)).toBe(false);

    // ponytail: Legacy SHA-256 salt fallback verification test
    const salt = 'abcdef0123456789';
    const encoder = new TextEncoder();
    const legacyBuf = await crypto.subtle.digest('SHA-256', encoder.encode(password + salt));
    const legacyHex = Array.from(new Uint8Array(legacyBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    const legacyStoredHash = `${legacyHex}:${salt}`;

    expect(await verifyPassword(password, legacyStoredHash)).toBe(true);
    expect(await verifyPassword('WrongPassword', legacyStoredHash)).toBe(false);
    expect(await verifyPassword(password, 'malformed-hash')).toBe(false);
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

  it('should fail closed on invalid Midtrans webhook signature', async () => {
    const gateway = new MidtransGateway('SB-Mid-server-TESTKEY123');
    const badPayload = {
      order_id: 'ORD-123456',
      status_code: '200',
      gross_amount: '50000.00',
      signature_key: 'invalid_signature_hex',
      transaction_status: 'settlement'
    };
    await expect(gateway.verifyWebhook(badPayload, {})).rejects.toThrow('Invalid Midtrans webhook signature');
  });

  it('should fail closed on missing or invalid Sumopod webhook signature', async () => {
    const gateway = new SumopodGateway('api-key', false, 'whsec_dGVzdHNlY3JldA==');
    await expect(gateway.verifyWebhook({}, {})).rejects.toThrow('Missing Svix webhook signature headers');
  });

  it('should reject unconfigured gateway when mock mode is disabled', async () => {
    const gateway = new XenditGateway('', '', false);
    await expect(gateway.createTransaction({
      orderId: 'ORD-1',
      amount: 10000,
      customerEmail: 'test@example.com',
      customerName: 'Test',
      items: []
    })).rejects.toThrow('Xendit secret key is not configured');
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
    const hero = new HeroSmsClient('', 'https://hero-sms.com/stubs/handler_api.php', true);
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
