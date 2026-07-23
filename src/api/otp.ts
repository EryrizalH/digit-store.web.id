// ponytail: HeroSMS OTP catalog, quote generation & admin settings with USD currency enforcement & rate limiting
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { Env } from '../types';
import { getSessionUser } from '../services/auth';
import { HeroSmsClient, HeroSmsError } from '../services/herosms';
import { checkRateLimit } from '../services/rate-limit';

export const otpRouter = new Hono<{ Bindings: Env }>();

// Simple in-memory cache for catalog endpoints to stay well under HeroSMS 40 RPS limit
let servicesCache: { data: any[]; timestamp: number } | null = null;
let countriesCache: { data: any[]; timestamp: number } | null = null;
let pricesCache: { data: Record<string, any>; timestamp: number } | null = null;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds cache

export function clearOtpCaches() {
  servicesCache = null;
  countriesCache = null;
  pricesCache = null;
}

export function calculateSellingPrice(
  providerCost: number,
  rate: number,
  markupPercent: number,
  minPriceIdr: number
): number {
  const calculated = providerCost * rate * (1 + markupPercent / 100);
  return Math.ceil(Math.max(calculated, Math.max(3000, minPriceIdr || 0)));
}

// Helper to get OTP settings
export async function getOtpSettings(db: D1Database) {
  return await db.prepare('SELECT * FROM otp_settings WHERE id = 1').first<any>();
}

// Helper to validate OTP settings (USD-only, rate > 0, markup >= 0, minPrice >= 3000)
export function validateOtpSettings(settings: any): { valid: boolean; reason?: string } {
  if (!settings || !settings.enabled) {
    return { valid: false, reason: 'OTP configurator is disabled' };
  }
  const curr = (settings.provider_currency || '').trim().toUpperCase();
  if (curr !== 'USD') {
    return { valid: false, reason: 'Provider currency must be USD' };
  }
  const rate = Number(settings.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { valid: false, reason: 'USD to IDR rate must be positive' };
  }
  const markup = Number(settings.markup_percent);
  if (!Number.isFinite(markup) || markup < 0) {
    return { valid: false, reason: 'Markup percent must be non-negative' };
  }
  const minPrice = Number(settings.min_price_idr);
  if (!Number.isFinite(minPrice) || minPrice < 3000) {
    return { valid: false, reason: 'Minimum price must be at least IDR 3000' };
  }
  return { valid: true };
}

// Helper to create HeroSmsClient with dev/prod mock rules
export function createHeroSmsClient(env: Env): HeroSmsClient {
  const isDev = env.APP_ENV === 'development';
  return new HeroSmsClient(env.HEROSMS_API_KEY || '', env.HEROSMS_BASE_URL, isDev);
}

// 1. Catalog: Services
otpRouter.get('/services', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || '127.0.0.1';
  const rl = await checkRateLimit(c.env.RATE_LIMIT_KV, `services:${ip}`, 30, 60);
  if (!rl.success) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }

  if (!c.env.HEROSMS_API_KEY && c.env.APP_ENV !== 'development') {
    return c.json({ error: 'HeroSMS API key is not configured.', code: 'HEROSMS_NOT_CONFIGURED' }, 503);
  }

  const settings = await getOtpSettings(c.env.DB);
  const v = validateOtpSettings(settings);
  if (!v.valid) {
    return c.json({ error: 'OTP configurator is unavailable until valid enabled settings are saved by admin.', code: 'OTP_SETTINGS_UNAVAILABLE' }, 503);
  }

  const now = Date.now();
  if (servicesCache && (now - servicesCache.timestamp) < CACHE_TTL_MS) {
    return c.json({ services: servicesCache.data });
  }

  const client = createHeroSmsClient(c.env);
  try {
    const list = await client.getServicesList();
    servicesCache = { data: list, timestamp: now };
    return c.json({ services: list });
  } catch (err: any) {
    if (err instanceof HeroSmsError && err.code === 'CONFIG_ERROR') {
      return c.json({ error: 'HeroSMS API key is not configured.', code: 'HEROSMS_NOT_CONFIGURED' }, 503);
    }
    return c.json({ error: 'Gagal mengambil daftar layanan dari provider HeroSMS' }, 502);
  }
});

// 2. Catalog: Countries (filtered by selected service)
otpRouter.get('/countries', async (c) => {
  const service = c.req.query('service');
  if (!service) {
    return c.json({ error: 'Parameter service required' }, 400);
  }

  const ip = c.req.header('cf-connecting-ip') || '127.0.0.1';
  const rl = await checkRateLimit(c.env.RATE_LIMIT_KV, `countries:${ip}`, 30, 60);
  if (!rl.success) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }

  if (!c.env.HEROSMS_API_KEY && c.env.APP_ENV !== 'development') {
    return c.json({ error: 'HeroSMS API key is not configured.', code: 'HEROSMS_NOT_CONFIGURED' }, 503);
  }

  const settings = await getOtpSettings(c.env.DB);
  const v = validateOtpSettings(settings);
  if (!v.valid) {
    return c.json({ error: 'OTP configurator is unavailable until valid enabled settings are saved by admin.', code: 'OTP_SETTINGS_UNAVAILABLE' }, 503);
  }

  const now = Date.now();
  const client = createHeroSmsClient(c.env);

  try {
    let rawCountries = countriesCache?.data;
    if (!rawCountries || (now - (countriesCache?.timestamp || 0)) >= CACHE_TTL_MS) {
      const fetched = await client.getCountries();
      rawCountries = fetched.filter(c => c.visible !== 0);
      countriesCache = { data: rawCountries, timestamp: now };
    }

    let pricesMap = pricesCache?.data;
    if (!pricesMap || (now - (pricesCache?.timestamp || 0)) >= CACHE_TTL_MS) {
      pricesMap = await client.getPrices();
      pricesCache = { data: pricesMap, timestamp: now };
    }

    // Filter to countries that have current price & numbers available for requested service
    const availableCountries = rawCountries.filter((cItem) => {
      const cId = String(cItem.id);
      const countryPrices = pricesMap?.[cId];
      if (!countryPrices) return false;
      const sInfo = countryPrices[service];
      return sInfo && Number(sInfo.count || 0) > 0 && Number(sInfo.cost || 0) > 0;
    }).map((cItem) => ({
      id: cItem.id,
      eng: cItem.eng,
      rus: cItem.rus,
      visible: cItem.visible
    }));

    return c.json({ countries: availableCountries });
  } catch (err: any) {
    if (err instanceof HeroSmsError && err.code === 'CONFIG_ERROR') {
      return c.json({ error: 'HeroSMS API key is not configured.', code: 'HEROSMS_NOT_CONFIGURED' }, 503);
    }
    return c.json({ error: 'Gagal mengambil daftar negara dari provider HeroSMS' }, 502);
  }
});

// 3. Price Quote Endpoint
otpRouter.get('/quote', async (c) => {
  const service = c.req.query('service');
  const country = c.req.query('country');

  if (!service || country === undefined || country === null || country.trim() === '') {
    return c.json({ error: 'Parameter service dan country wajib diisi.' }, 400);
  }

  const ip = c.req.header('cf-connecting-ip') || '127.0.0.1';
  const rl = await checkRateLimit(c.env.RATE_LIMIT_KV, `quote:${ip}`, 30, 60);
  if (!rl.success) {
    return c.json({ error: 'Quote rate limit exceeded' }, 429);
  }

  if (!c.env.HEROSMS_API_KEY && c.env.APP_ENV !== 'development') {
    return c.json({ error: 'HeroSMS API key is not configured.', code: 'HEROSMS_NOT_CONFIGURED' }, 503);
  }

  const settings = await getOtpSettings(c.env.DB);
  const v = validateOtpSettings(settings);
  if (!v.valid) {
    return c.json({
      error: 'OTP configurator is unavailable until valid enabled settings are saved by admin.',
      code: 'OTP_SETTINGS_UNAVAILABLE'
    }, 503);
  }

  const client = createHeroSmsClient(c.env);
  const now = Date.now();
  let prices: Record<string, any> = {};

  if (pricesCache && (now - pricesCache.timestamp) < CACHE_TTL_MS) {
    prices = pricesCache.data;
  } else {
    try {
      prices = await client.getPrices();
      pricesCache = { data: prices, timestamp: now };
    } catch (err: any) {
      if (err instanceof HeroSmsError && err.code === 'CONFIG_ERROR') {
        return c.json({ error: 'HeroSMS API key is not configured.', code: 'HEROSMS_NOT_CONFIGURED' }, 503);
      }
      return c.json({ error: 'Gagal mengambil harga provider HeroSMS' }, 502);
    }
  }

  const countryPrices = prices[country] || prices[String(country)];
  const serviceInfo = countryPrices ? countryPrices[service] : null;

  if (!serviceInfo || !serviceInfo.cost || serviceInfo.count <= 0) {
    return c.json({
      error: 'Nomor tidak tersedia untuk layanan dan negara ini.',
      code: 'NO_NUMBERS_AVAILABLE',
      availableCount: 0
    }, 404);
  }

  const providerCost = Number(serviceInfo.cost);
  const availableCount = Number(serviceInfo.count);
  const sellingPriceIdr = calculateSellingPrice(
    providerCost,
    Number(settings.rate),
    Number(settings.markup_percent),
    Number(settings.min_price_idr)
  );

  const servicesList = servicesCache?.data || (await client.getServicesList().catch(() => []));
  const countriesList = countriesCache?.data || (await client.getCountries().catch(() => []));

  const serviceItem = servicesList.find((s: any) => s.code === service);
  const countryItem = countriesList.find((c: any) => String(c.id) === String(country));

  const serviceName = serviceItem?.name || service.toUpperCase();
  const countryName = countryItem?.eng || (country === '0' ? 'Russia' : `Country ${country}`);

  const expiresAt = now + 60 * 1000; // 60 seconds quote expiry
  const quoteId = `q_${crypto.randomUUID()}`;

  // Public quote response - NEVER expose providerCost or maxPrice!
  return c.json({
    quote: {
      quoteId,
      serviceCode: service,
      serviceName,
      countryCode: String(country),
      countryName,
      sellingPriceIdr,
      expiresAt,
      availableCount
    }
  });
});

// 4. Admin Settings GET
otpRouter.get('/settings', async (c) => {
  const sessionId = getCookie(c, 'session');
  const user = await getSessionUser(c.env.DB, sessionId || '');
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Unauthorized admin access' }, 401);
  }

  const settings = await getOtpSettings(c.env.DB);
  return c.json({ settings: settings || null });
});

// 5. Admin Settings POST
otpRouter.post('/settings', async (c) => {
  const sessionId = getCookie(c, 'session');
  const user = await getSessionUser(c.env.DB, sessionId || '');
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Unauthorized admin access' }, 401);
  }

  const body = await c.req.json();
  const enabled = body.enabled ? 1 : 0;
  const providerCurrency = 'USD'; // Always USD for HeroSMS flow
  const rate = parseFloat(body.rate);
  const markupPercent = parseFloat(body.markupPercent);
  const minSalePriceIdr = parseFloat(body.minSalePriceIdr);

  if (enabled && (!Number.isFinite(rate) || rate <= 0)) {
    return c.json({ error: 'Kurs USD ke IDR harus berupa angka positif.' }, 400);
  }
  if (enabled && (!Number.isFinite(markupPercent) || markupPercent < 0)) {
    return c.json({ error: 'Margin (%) harus berupa angka non-negatif.' }, 400);
  }
  if (enabled && (!Number.isFinite(minSalePriceIdr) || minSalePriceIdr < 3000)) {
    return c.json({ error: 'Harga jual minimum IDR harus minimal 3000.' }, 400);
  }

  await c.env.DB.prepare(`
    INSERT INTO otp_settings (id, enabled, provider_currency, rate, markup_percent, min_price_idr, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      enabled = excluded.enabled,
      provider_currency = excluded.provider_currency,
      rate = excluded.rate,
      markup_percent = excluded.markup_percent,
      min_price_idr = excluded.min_price_idr,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    enabled,
    providerCurrency,
    Number.isFinite(rate) && rate > 0 ? rate : 16000,
    Number.isFinite(markupPercent) && markupPercent >= 0 ? markupPercent : 20,
    Number.isFinite(minSalePriceIdr) && minSalePriceIdr >= 3000 ? minSalePriceIdr : 3000
  ).run();

  const updated = await getOtpSettings(c.env.DB);
  pricesCache = null;

  return c.json({ success: true, settings: updated });
});
