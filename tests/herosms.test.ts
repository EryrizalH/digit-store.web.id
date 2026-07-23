import { describe, it, expect, vi, afterEach } from 'vitest';
import { HeroSmsClient, HeroSmsError } from '../src/services/herosms';
import { activationsRouter } from '../src/api/activations';

describe('HeroSMS Client & Activations Router Tests', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('HeroSmsClient URL Construction & Encoding', () => {
    const client = new HeroSmsClient('test_api_key', 'https://hero-sms.com/stubs/handler_api.php');

    it('builds safely encoded URL with URLSearchParams', () => {
      const urlStr = client.buildUrl('getNumber', { service: 'wa', country: '0' });
      const url = new URL(urlStr);
      expect(url.searchParams.get('api_key')).toBe('test_api_key');
      expect(url.searchParams.get('action')).toBe('getNumber');
      expect(url.searchParams.get('service')).toBe('wa');
      expect(url.searchParams.get('country')).toBe('0');
    });
  });

  describe('HeroSmsClient Price Parsing Variants & Error Envelopes', () => {
    const client = new HeroSmsClient('test_api_key', 'https://hero-sms.com/stubs/handler_api.php');

    it('normalizes full country/service map shape', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        '0': { tg: { cost: 0.15, count: 100 } }
      })));
      const prices = await client.getPrices();
      expect(prices).toEqual({
        '0': { tg: { cost: 0.15, count: 100 } }
      });
    });

    it('normalizes country-filtered service map when country option is passed', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        tg: { cost: 0.20, count: 50 }
      })));
      const prices = await client.getPrices('tg', '0');
      expect(prices).toEqual({
        '0': { tg: { cost: 0.20, count: 50 } }
      });
    });

    it('normalizes service-filtered country map when service option is passed', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        '0': { cost: 0.25, count: 30 }
      })));
      const prices = await client.getPrices('tg');
      expect(prices).toEqual({
        '0': { tg: { cost: 0.25, count: 30 } }
      });
    });

    it('normalizes single price object when country and service options are passed', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        cost: 0.12,
        count: 40
      })));
      const prices = await client.getPrices('tg', '0');
      expect(prices).toEqual({
        '0': { tg: { cost: 0.12, count: 40 } }
      });
    });

    it('detects provider JSON error envelopes and throws HeroSmsError', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        title: 'ERROR',
        msg: 'BAD_KEY'
      })));
      await expect(client.getPrices()).rejects.toThrow(HeroSmsError);
    });

    it('normalizes provider currency ISO code 840 to USD', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        id: '12345',
        phoneNumber: '+62812345678',
        activationCost: 0.15,
        currency: '840'
      })));
      const res = await client.getNumberV2('tg', '0');
      expect(res.currency).toBe('USD');
    });

    it('throws HeroSmsError in production when HEROSMS_API_KEY is absent without allowMock', async () => {
      const prodClient = new HeroSmsClient('', 'https://hero-sms.com/stubs/handler_api.php', false);
      await expect(prodClient.getPrices()).rejects.toThrow(HeroSmsError);
    });
  });

  describe('HeroSmsClient Status Parsing & Errors', () => {
    const client = new HeroSmsClient('test_api_key', 'https://hero-sms.com/stubs/handler_api.php');

    it('parses STATUS_WAIT_CODE, STATUS_WAIT_RETRY, and STATUS_WAIT_RESEND as WAITING_CODE', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('STATUS_WAIT_CODE'));
      expect(await client.getStatus('12345')).toEqual({ status: 'WAITING_CODE' });

      globalThis.fetch = vi.fn().mockResolvedValue(new Response('STATUS_WAIT_RETRY'));
      expect(await client.getStatus('12345')).toEqual({ status: 'WAITING_CODE' });

      globalThis.fetch = vi.fn().mockResolvedValue(new Response('STATUS_WAIT_RESEND'));
      expect(await client.getStatus('12345')).toEqual({ status: 'WAITING_CODE' });
    });

    it('parses STATUS_OK:code correctly', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('STATUS_OK:987654'));
      expect(await client.getStatus('12345')).toEqual({
        status: 'RECEIVED',
        code: '987654',
        fullText: 'STATUS_OK:987654'
      });
    });

    it('parses STATUS_CANCEL correctly', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('STATUS_CANCEL'));
      expect(await client.getStatus('12345')).toEqual({ status: 'CANCELLED' });
    });

    it('throws HeroSmsError on unknown or provider error response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('NO_ACTIVATION'));
      await expect(client.getStatus('12345')).rejects.toThrow(HeroSmsError);

      globalThis.fetch = vi.fn().mockResolvedValue(new Response('BAD_KEY'));
      await expect(client.getStatus('12345')).rejects.toThrow(HeroSmsError);
    });

    it('throws HeroSmsError on non-200 HTTP status', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 }));
      await expect(client.getStatus('12345')).rejects.toThrow(HeroSmsError);
    });
  });

  describe('HeroSmsClient Strict Cancellation Matching', () => {
    const client = new HeroSmsClient('test_api_key', 'https://hero-sms.com/stubs/handler_api.php');

    it('returns true for exact ACCESS_CANCEL or ACCESS_CANCEL_ALREADY', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('ACCESS_CANCEL'));
      expect(await client.cancelActivation('12345')).toBe(true);

      globalThis.fetch = vi.fn().mockResolvedValue(new Response('ACCESS_CANCEL_ALREADY'));
      expect(await client.cancelActivation('12345')).toBe(true);
    });

    it('throws HeroSmsError when response is not an exact cancel match', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('ACCESS_CANCEL_UNKNOWN_SUFFIX'));
      await expect(client.cancelActivation('12345')).rejects.toThrow(HeroSmsError);

      globalThis.fetch = vi.fn().mockResolvedValue(new Response('EARLY_CANCEL_NOT_ALLOWED'));
      await expect(client.cancelActivation('12345')).rejects.toThrow(HeroSmsError);
    });
  });

  describe('HeroSmsClient Balance Check (Read-Only Safety)', () => {
    it('parses ACCESS_BALANCE response without spending balance', async () => {
      const client = new HeroSmsClient('test_api_key', 'https://hero-sms.com/stubs/handler_api.php');
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('ACCESS_BALANCE:25.50'));
      const balance = await client.getBalance();
      expect(balance).toBe('25.50');
    });
  });

  describe('Activations Router Error & Preservation Behavior', () => {
    const createMockDb = (status: string = 'WAITING_CODE') => {
      const dbState = { status, sms_code: null, sms_text: null };
      return {
        dbState,
        db: {
          prepare: vi.fn().mockImplementation((query: string) => ({
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockImplementation(async () => {
              if (query.includes('FROM sessions s')) {
                return { id: 'u1', email: 'user@test.com', role: 'user', created_at: new Date().toISOString() };
              }
              if (query.includes('SELECT * FROM sms_activations')) {
                return {
                  id: 'act1',
                  order_id: 'ord1',
                  user_id: 'u1',
                  herosms_id: '12345',
                  status: dbState.status,
                  herosms_phone: '+62812345678'
                };
              }
              return null;
            }),
            run: vi.fn().mockImplementation(async () => {
              if (query.includes("UPDATE sms_activations SET status = 'CANCELLED'")) {
                dbState.status = 'CANCELLED';
              } else if (query.includes("status = 'RECEIVED'")) {
                dbState.status = 'RECEIVED';
              }
              return { success: true };
            })
          }))
        } as any
      };
    };

    it('poll route returns 502 and leaves DB status unchanged on provider error', async () => {
      const { db, dbState } = createMockDb('WAITING_CODE');
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('BAD_KEY'));

      const env: any = {
        DB: db,
        HEROSMS_API_KEY: 'bad_key_test',
        HEROSMS_BASE_URL: 'https://hero-sms.com/stubs/handler_api.php'
      };

      const req = new Request('http://localhost/act1/poll', {
        headers: { Cookie: 'session=sess1' }
      });

      const res = await activationsRouter.fetch(req, env);
      expect(res.status).toBe(502);

      const json = await res.json() as any;
      expect(json.error).toBe('HeroSMS provider status check failed');
      expect(json.details).toBe('BAD_KEY');
      expect(dbState.status).toBe('WAITING_CODE'); // Unchanged!
    });

    it('cancel route returns 400 and leaves DB status unchanged on cancellation rejection', async () => {
      const { db, dbState } = createMockDb('WAITING_CODE');
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('EARLY_CANCEL_NOT_ALLOWED'));

      const env: any = {
        DB: db,
        HEROSMS_API_KEY: 'test_key',
        HEROSMS_BASE_URL: 'https://hero-sms.com/stubs/handler_api.php'
      };

      const req = new Request('http://localhost/act1/cancel', {
        method: 'POST',
        headers: { Cookie: 'session=sess1' }
      });

      const res = await activationsRouter.fetch(req, env);
      expect(res.status).toBe(400);

      const json = await res.json() as any;
      expect(json.error).toBe('Cancellation failed');
      expect(json.details).toBe('EARLY_CANCEL_NOT_ALLOWED');
      expect(dbState.status).toBe('WAITING_CODE'); // Unchanged!
    });

    it('cancel route updates DB status to CANCELLED on confirmation', async () => {
      const { db, dbState } = createMockDb('WAITING_CODE');
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('ACCESS_CANCEL'));

      const env: any = {
        DB: db,
        HEROSMS_API_KEY: 'test_key',
        HEROSMS_BASE_URL: 'https://hero-sms.com/stubs/handler_api.php'
      };

      const req = new Request('http://localhost/act1/cancel', {
        method: 'POST',
        headers: { Cookie: 'session=sess1' }
      });

      const res = await activationsRouter.fetch(req, env);
      expect(res.status).toBe(200);

      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(dbState.status).toBe('CANCELLED');
    });
  });
});
