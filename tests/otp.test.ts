// ponytail: Comprehensive Vitest suite covering DTO sanitization, strict boolean policy, fail-closed catalogue, exact dev opt-in simulated pay, 60s quote lifetime, and 409 price refresh flow
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HeroSmsClient, HeroSmsError } from '../src/services/herosms';
import { calculateSellingPrice, otpRouter, clearOtpCaches } from '../src/api/otp';
import { ordersRouter } from '../src/api/orders';
import { activationsRouter } from '../src/api/activations';
import { productsRouter } from '../src/api/products';
import { fulfillOrder } from '../src/services/fulfilment';
import { sanitizeCartItem } from '../src/context/CartContext';

describe('HeroSMS OTP Configurator & End-to-End Suite', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearOtpCaches();
  });

  describe('Price Calculation Formula', () => {
    it('calculates price using USD rate, margin %, and Rp3.000 floor', () => {
      // $0.08 provider cost -> calculated 0.08 * 16000 * 1.20 = 1536, floor applied -> 3000
      expect(calculateSellingPrice(0.08, 16000, 20, 3000)).toBe(3000);
      // $0.25 provider cost -> calculated 0.25 * 16000 * 1.20 = 4800 -> 4800
      expect(calculateSellingPrice(0.25, 16000, 20, 3000)).toBe(4800);
      expect(calculateSellingPrice(10, 200, 20, 5000)).toBe(5000);
      expect(calculateSellingPrice(30, 200, 20, 5000)).toBe(7200);
    });
  });

  describe('Provider Cost Leakage Protection & Public Quote Privacy', () => {
    it('never exposes maxPrice or providerCost in public quote API response', async () => {
      const mockEnv: any = {
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({ enabled: 1, provider_currency: 'USD', rate: 16000, markup_percent: 20, min_price_idr: 3000 })
          })
        },
        RATE_LIMIT_KV: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(null) },
        HEROSMS_API_KEY: 'test_key',
        HEROSMS_BASE_URL: 'https://hero-sms.com/stubs/handler_api.php'
      };

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('action=getPrices')) {
          return new Response(JSON.stringify({ '0': { tg: { cost: 0.25, count: 100 } } }));
        }
        if (url.includes('action=getServicesList')) {
          return new Response(JSON.stringify([{ code: 'tg', name: 'Telegram' }]));
        }
        if (url.includes('action=getCountries')) {
          return new Response(JSON.stringify([{ id: 0, eng: 'Russia', visible: 1 }]));
        }
        return new Response('{}');
      });

      const req = new Request('http://localhost/quote?service=tg&country=0');
      const res = await otpRouter.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const json = await res.json() as any;

      expect(json.quote).toBeDefined();
      expect(json.quote.sellingPriceIdr).toBe(4800);
      expect(json.quote.maxPrice).toBeUndefined();
      expect(json.quote.providerCost).toBeUndefined();
    });

    it('ensures requesting service/country A does not corrupt global cached catalog for service/country B within TTL', async () => {
      const mockEnv: any = {
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({ enabled: 1, provider_currency: 'USD', rate: 16000, markup_percent: 20, min_price_idr: 3000 })
          })
        },
        RATE_LIMIT_KV: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(null) },
        HEROSMS_API_KEY: 'test_key',
        HEROSMS_BASE_URL: 'https://hero-sms.com/stubs/handler_api.php'
      };

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('action=getPrices')) {
          return new Response(JSON.stringify({
            '0': { tg: { cost: 0.25, count: 100 }, wa: { cost: 0.50, count: 50 } },
            '2': { wa: { cost: 0.40, count: 30 } }
          }));
        }
        if (url.includes('action=getServicesList')) {
          return new Response(JSON.stringify([{ code: 'tg', name: 'Telegram' }, { code: 'wa', name: 'WhatsApp' }]));
        }
        if (url.includes('action=getCountries')) {
          return new Response(JSON.stringify([{ id: 0, eng: 'Russia', visible: 1 }, { id: 2, eng: 'Kazakhstan', visible: 1 }]));
        }
        return new Response('{}');
      });

      // 1. Request countries for service tg (populates global pricesCache with full catalog)
      const reqTg = new Request('http://localhost/countries?service=tg');
      const resTg = await otpRouter.fetch(reqTg, mockEnv);
      expect(resTg.status).toBe(200);
      const jsonTg = await resTg.json() as any;
      expect(jsonTg.countries).toHaveLength(1);
      expect(jsonTg.countries[0].id).toBe(0);

      // 2. Request countries for service wa within TTL (uses cached full catalog map)
      const reqWa = new Request('http://localhost/countries?service=wa');
      const resWa = await otpRouter.fetch(reqWa, mockEnv);
      expect(resWa.status).toBe(200);
      const jsonWa = await resWa.json() as any;
      expect(jsonWa.countries).toHaveLength(2);

      // 3. Request quote for wa / country 2
      const reqQuote = new Request('http://localhost/quote?service=wa&country=2');
      const resQuote = await otpRouter.fetch(reqQuote, mockEnv);
      expect(resQuote.status).toBe(200);
      const jsonQuote = await resQuote.json() as any;
      expect(jsonQuote.quote.sellingPriceIdr).toBe(7680);
    });

    it('returns 503 OTP_SETTINGS_UNAVAILABLE when OTP settings currency is not USD or rate <= 0 or min_price < 3000', async () => {
      const mockEnv: any = {
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({ enabled: 1, provider_currency: 'RUB', rate: 200, markup_percent: 20, min_price_idr: 5000 })
          })
        },
        RATE_LIMIT_KV: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(null) },
        HEROSMS_API_KEY: 'test_key'
      };

      const req = new Request('http://localhost/quote?service=tg&country=0');
      const res = await otpRouter.fetch(req, mockEnv);
      expect(res.status).toBe(503);
      const json = await res.json() as any;
      expect(json.code).toBe('OTP_SETTINGS_UNAVAILABLE');
    });

    it('returns 503 HEROSMS_NOT_CONFIGURED in production when HEROSMS_API_KEY is absent', async () => {
      const mockEnv: any = {
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({ enabled: 1, provider_currency: 'USD', rate: 16000, markup_percent: 20, min_price_idr: 3000 })
          })
        },
        RATE_LIMIT_KV: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(null) },
        APP_ENV: 'production'
      };

      const req = new Request('http://localhost/quote?service=tg&country=0');
      const res = await otpRouter.fetch(req, mockEnv);
      expect(res.status).toBe(503);
      const json = await res.json() as any;
      expect(json.code).toBe('HEROSMS_NOT_CONFIGURED');
    });

    it('requires both service and country query parameters at /quote', async () => {
      const mockEnv: any = {
        RATE_LIMIT_KV: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(null) }
      };

      const req = new Request('http://localhost/quote?service=tg');
      const res = await otpRouter.fetch(req, mockEnv);
      expect(res.status).toBe(400);
    });
  });

  describe('Customer API DTO Sanitization (No Internal Provider Leakage)', () => {
    it('sanitizes order detail API response to omit max_price, provider_cost, provider_currency, and herosms_id', async () => {
      const mockEnv: any = {
        DB: {
          prepare: vi.fn().mockImplementation((query: string) => ({
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockImplementation(async () => {
              if (query.includes('FROM sessions')) return { id: 'u1', role: 'user' };
              if (query.includes('FROM orders')) return { id: 'ord1', user_id: 'u1', total_amount: 5000, payment_status: 'paid' };
              return null;
            }),
            all: vi.fn().mockImplementation(async () => {
              if (query.includes('FROM order_items')) {
                return {
                  results: [{
                    id: 'item1', order_id: 'ord1', product_id: 'p1', product_name: 'OTP', product_type: 'herosms', price: 5000, quantity: 1, max_price: 0.15
                  }]
                };
              }
              if (query.includes('FROM sms_activations')) {
                return {
                  results: [{
                    id: 'act1', order_item_id: 'item1', order_id: 'ord1', user_id: 'u1', herosms_id: '12345', herosms_phone: '7911', herosms_service: 'tg', herosms_country: '0', provider_cost: 0.15, provider_currency: 'USD', status: 'WAITING_CODE'
                  }]
                };
              }
              return { results: [] };
            })
          }))
        }
      };

      const req = new Request('http://localhost/ord1', { headers: { Cookie: 'session=sess1' } });
      const res = await ordersRouter.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const json = await res.json() as any;

      expect(json.items[0].max_price).toBeUndefined();
      expect(json.smsActivations[0].provider_cost).toBeUndefined();
      expect(json.smsActivations[0].provider_currency).toBeUndefined();
      expect(json.smsActivations[0].herosms_id).toBeUndefined();
    });

    it('sanitizes activation polling response to omit provider_cost, provider_currency, and herosms_id', async () => {
      const mockEnv: any = {
        DB: {
          prepare: vi.fn().mockImplementation((query: string) => ({
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockImplementation(async () => {
              if (query.includes('FROM sessions')) return { id: 'u1', role: 'user' };
              if (query.includes('FROM sms_activations')) {
                return { id: 'act1', user_id: 'u1', herosms_id: '12345', status: 'WAITING_CODE', provider_cost: 0.15, provider_currency: 'USD' };
              }
              return null;
            })
          }))
        },
        RATE_LIMIT_KV: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(null) },
        HEROSMS_API_KEY: 'key'
      };

      globalThis.fetch = vi.fn().mockResolvedValue(new Response('STATUS_WAIT_CODE'));

      const req = new Request('http://localhost/act1/poll', { headers: { Cookie: 'session=sess1' } });
      const res = await activationsRouter.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const json = await res.json() as any;

      expect(json.activation.provider_cost).toBeUndefined();
      expect(json.activation.provider_currency).toBeUndefined();
      expect(json.activation.herosms_id).toBeUndefined();
    });

    it('sanitizeCartItem helper strips maxPrice from cart objects', () => {
      const dirty = { product: { type: 'herosms' }, quantity: 2, maxPrice: 0.15, max_price: 0.15, price: 5000 };
      const clean = sanitizeCartItem(dirty);
      expect(clean.maxPrice).toBeUndefined();
      expect((clean as any).max_price).toBeUndefined();
      expect(clean.quantity).toBe(1);
    });
  });

  describe('Strict Policy Check & Fail-Closed Catalogue Checkout', () => {
    const createMockEnv = (apiKey = 'test_key') => ({
      DB: {
        prepare: vi.fn().mockImplementation((query: string) => ({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockImplementation(async () => {
            if (query.includes('FROM sessions')) return { id: 'usr_1', email: 'user@test.com', role: 'user' };
            if (query.includes('FROM products WHERE id')) return { id: 'p_otp', name: 'HeroSMS OTP', type: 'herosms', price: 0, is_active: 1 };
            if (query.includes('FROM otp_settings')) return { enabled: 1, provider_currency: 'USD', rate: 16000, markup_percent: 20, min_price_idr: 3000 };
            return null;
          }),
          run: vi.fn().mockResolvedValue({ success: true })
        }))
      },
      RATE_LIMIT_KV: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(null) },
      HEROSMS_API_KEY: apiKey,
      HEROSMS_BASE_URL: 'https://hero-sms.com/stubs/handler_api.php'
    } as any);

    it('rejects checkout if agreed_policy is not strictly true boolean', async () => {
      const env = createMockEnv();
      const req = new Request('http://localhost/checkout', {
        method: 'POST',
        headers: { Cookie: 'session=sess_1', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ product_id: 'p_otp', quantity: 1, service_code: 'tg', country_code: '0', price: 4800, expires_at: Date.now() + 30000 }],
          agreed_policy: "true"
        })
      });

      const res = await ordersRouter.fetch(req, env);
      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.error).toContain('kebijakan');
    });

    it('fails closed with HTTP 502 when live provider API key is set and catalogue lookup fails', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Provider network failure'));

      const env = createMockEnv('test_live_key');
      const req = new Request('http://localhost/checkout', {
        method: 'POST',
        headers: { Cookie: 'session=sess_1', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ product_id: 'p_otp', quantity: 1, service_code: 'tg', country_code: '0', price: 4800, expires_at: Date.now() + 30000 }],
          agreed_policy: true
        })
      });

      const res = await ordersRouter.fetch(req, env);
      expect(res.status).toBe(502);
      const json = await res.json() as any;
      expect(json.error).toContain('katalog');
    });

    it('returns 409 OTP_PRICE_CHANGED with freshQuote route details when price or quote expires', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('action=getPrices')) return new Response(JSON.stringify({ '0': { tg: { cost: 0.25, count: 100 } } }));
        if (url.includes('action=getServicesList')) return new Response(JSON.stringify([{ code: 'tg', name: 'Telegram' }]));
        if (url.includes('action=getCountries')) return new Response(JSON.stringify([{ id: 0, eng: 'Russia' }]));
        return new Response('{}');
      });

      const env = createMockEnv();
      const req = new Request('http://localhost/checkout', {
        method: 'POST',
        headers: { Cookie: 'session=sess_1', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ product_id: 'p_otp', quantity: 1, service_code: 'tg', country_code: '0', price: 4800, expires_at: Date.now() - 100 }],
          agreed_policy: true
        })
      });

      const res = await ordersRouter.fetch(req, env);
      expect(res.status).toBe(409);
      const json = await res.json() as any;

      expect(json.code).toBe('OTP_PRICE_CHANGED');
      expect(json.freshQuote).toBeDefined();
      expect(json.freshQuote.productId).toBe('p_otp');
      expect(json.freshQuote.serviceCode).toBe('tg');
      expect(json.freshQuote.countryCode).toBe('0');
      expect(json.freshQuote.freshSellingPrice).toBe(4800);
      expect(json.freshQuote.quoteId).toBeDefined();
      expect(json.freshQuote.maxPrice).toBeUndefined(); // No provider cost leaked!
    });
  });

  describe('Payment Bypass Fail-Closed Security (Workers.dev APP_URL)', () => {
    it('returns HTTP 403 on simulated-pay for real configured APP_URL https://digit-store.eryrizal23.workers.dev without opt-in', async () => {
      const mockEnv: any = {
        APP_URL: 'https://digit-store.eryrizal23.workers.dev',
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({ id: 'u1', role: 'user' })
          })
        }
      };

      const req = new Request('http://localhost/ord1/simulated-pay', {
        method: 'POST',
        headers: { Cookie: 'session=sess1' }
      });

      const res = await ordersRouter.fetch(req, mockEnv);
      expect(res.status).toBe(403);
    });

    it('allows simulated-pay ONLY when APP_ENV === development AND ALLOW_SIMULATED_PAYMENTS === true', async () => {
      const mockEnv: any = {
        APP_ENV: 'development',
        ALLOW_SIMULATED_PAYMENTS: 'true',
        DB: {
          prepare: vi.fn().mockImplementation((query: string) => ({
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockImplementation(async () => {
              if (query.includes('FROM sessions')) return { id: 'u1', role: 'user' };
              if (query.includes('FROM orders')) return { id: 'ord1', user_id: 'u1', payment_status: 'pending' };
              return null;
            }),
            all: vi.fn().mockResolvedValue({ results: [] }),
            run: vi.fn().mockResolvedValue({ success: true })
          }))
        }
      };

      const req = new Request('http://localhost/ord1/simulated-pay', {
        method: 'POST',
        headers: { Cookie: 'session=sess1' }
      });

      const res = await ordersRouter.fetch(req, mockEnv);
      expect(res.status).toBe(200);
    });
  });

  describe('HeroSMS Product Catalog Hiding & Canonical Route', () => {
    it('hides herosms products from normal public catalog GET /', async () => {
      const mockEnv: any = {
        DB: {
          prepare: vi.fn().mockImplementation((query: string) => {
            expect(query).toContain("p.type != 'herosms'");
            return {
              all: vi.fn().mockResolvedValue({
                results: [
                  { id: 'p1', name: 'Software', slug: 'sw', price: 10000, type: 'file', is_active: 1 }
                ]
              })
            };
          })
        }
      };

      const req = new Request('http://localhost/');
      const res = await productsRouter.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.products).toHaveLength(1);
      expect(json.products[0].type).toBe('file');
    });

    it('resolves canonical route /api/products/by-slug/herosms-otp-configurator with real backing product', async () => {
      const mockEnv: any = {
        DB: {
          prepare: vi.fn().mockImplementation((query: string) => ({
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockImplementation(async () => {
              if (query.includes("WHERE p.type = 'herosms'")) {
                return {
                  id: 'prd_real_herosms',
                  category_id: 'cat_sms',
                  name: 'HeroSMS OTP Active Product',
                  slug: 'herosms-otp-active',
                  description: 'Real backing HeroSMS product',
                  price: 0,
                  type: 'herosms',
                  image_key: null,
                  herosms_service: null,
                  herosms_country: null,
                  is_active: 1,
                  created_at: '2026-01-01T00:00:00Z',
                  category_name: 'Aktivasi HeroSMS',
                  stock_count: 0
                };
              }
              return null;
            })
          }))
        }
      };

      const req = new Request('http://localhost/by-slug/herosms-otp-configurator');
      const res = await productsRouter.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.product).toBeDefined();
      expect(json.product.id).toBe('prd_real_herosms');
      expect(json.product.type).toBe('herosms');
    });

    it('returns 404 when no active backing HeroSMS product exists in DB', async () => {
      const mockEnv: any = {
        DB: {
          prepare: vi.fn().mockImplementation(() => ({
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(null)
          }))
        }
      };

      const req = new Request('http://localhost/by-slug/herosms-otp-configurator');
      const res = await productsRouter.fetch(req, mockEnv);
      expect(res.status).toBe(404);
      const json = await res.json() as any;
      expect(json.error).toBe('Product not found');
    });
  });

  describe('Fulfillment Production Security', () => {
    it('fails item fulfillment with CONFIG_ERROR in production when HEROSMS_API_KEY is missing', async () => {
      const dbRuns: any[] = [];
      const mockEnv: any = {
        APP_ENV: 'production',
        HEROSMS_API_KEY: '',
        DB: {
          prepare: vi.fn().mockImplementation((query: string) => ({
            bind: vi.fn().mockImplementation((...args: any[]) => {
              dbRuns.push({ query, args });
              return {
                first: vi.fn().mockImplementation(async () => {
                  if (query.includes('FROM orders WHERE id')) return { id: 'ord1', user_id: 'u1' };
                  if (query.includes('FROM sms_activations')) return null;
                  return null;
                }),
                all: vi.fn().mockImplementation(async () => {
                  if (query.includes('FROM order_items')) {
                    return {
                      results: [{
                        id: 'item1', order_id: 'ord1', product_id: 'p1', product_type: 'herosms',
                        service_code: 'tg', country_code: '0', max_price: 0.15, fulfilment_status: 'pending'
                      }]
                    };
                  }
                  return { results: [] };
                }),
                run: vi.fn().mockResolvedValue({ meta: { changes: 1 } })
              };
            })
          }))
        }
      };

      await fulfillOrder('ord1', 'u1', mockEnv);

      const failedUpdate = dbRuns.find(r => r.query.includes("SET fulfilment_status = 'failed'"));
      expect(failedUpdate).toBeDefined();
      expect(failedUpdate.args[0]).toBe('CONFIG_ERROR');
    });
  });
});
