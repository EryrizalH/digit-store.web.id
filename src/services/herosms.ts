// ponytail: HeroSMS Client (SMS-Activate standard stub & catalog/v2 additions)

export class HeroSmsError extends Error {
  constructor(public code: string, message?: string) {
    super(message || `HeroSMS provider error: ${code}`);
    this.name = 'HeroSmsError';
  }
}

export interface HerosmsNumberResponse {
  activationId: string;
  phone: string;
  activationCost?: number;
  currency?: string;
}

export interface HerosmsStatusResponse {
  status: 'WAITING_CODE' | 'RECEIVED' | 'CANCELLED' | 'TIMEOUT' | 'COMPLETED';
  code?: string;
  fullText?: string;
}

export interface HeroSmsServiceItem {
  code: string;
  name: string;
}

export interface HeroSmsCountryItem {
  id: number;
  eng: string;
  rus?: string;
  visible?: number;
}

export class HeroSmsClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://hero-sms.com/stubs/handler_api.php') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  // ponytail: Build safely encoded URL using URL & URLSearchParams
  buildUrl(action: string, params: Record<string, string> = {}): string {
    const url = new URL(this.baseUrl);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('action', action);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  async getServicesList(country?: string, lang: string = 'en'): Promise<HeroSmsServiceItem[]> {
    if (!this.apiKey) {
      return [
        { code: 'tg', name: 'Telegram' },
        { code: 'wa', name: 'WhatsApp' },
        { code: 'go', name: 'Google' },
        { code: 'ig', name: 'Instagram' },
        { code: 'vk', name: 'VKontakte' }
      ];
    }

    const params: Record<string, string> = { lang };
    if (country) params.country = country;
    const url = this.buildUrl('getServicesList', params);
    const res = await fetch(url);
    if (!res.ok) throw new HeroSmsError('HTTP_ERROR', `HTTP status ${res.status}`);
    const text = (await res.text()).trim();

    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) return data;
      if (data.services && Array.isArray(data.services)) return data.services;
      if (typeof data === 'object') {
        return Object.entries(data).map(([code, val]: [string, any]) => ({
          code,
          name: typeof val === 'string' ? val : (val.name || code)
        }));
      }
    } catch {
      throw new HeroSmsError(text);
    }
    return [];
  }

  async getCountries(): Promise<HeroSmsCountryItem[]> {
    if (!this.apiKey) {
      return [
        { id: 0, eng: 'Russia', rus: 'Россия', visible: 1 },
        { id: 2, eng: 'Kazakhstan', rus: 'Казахстан', visible: 1 },
        { id: 6, eng: 'Indonesia', rus: 'Индонезия', visible: 1 }
      ];
    }

    const url = this.buildUrl('getCountries');
    const res = await fetch(url);
    if (!res.ok) throw new HeroSmsError('HTTP_ERROR', `HTTP status ${res.status}`);
    const text = (await res.text()).trim();

    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return data.map((item: any) => ({
          id: Number(item.id),
          eng: item.eng || String(item.id),
          rus: item.rus,
          visible: item.visible !== undefined ? Number(item.visible) : 1
        }));
      }
      if (typeof data === 'object') {
        return Object.entries(data).map(([idStr, val]: [string, any]) => ({
          id: Number(idStr),
          eng: typeof val === 'string' ? val : (val.eng || idStr),
          rus: val.rus,
          visible: val.visible !== undefined ? Number(val.visible) : 1
        }));
      }
    } catch {
      throw new HeroSmsError(text);
    }
    return [];
  }

  async getPrices(service?: string, country?: string): Promise<Record<string, Record<string, { cost: number; count: number }>>> {
    if (!this.apiKey) {
      return {
        '0': {
          tg: { cost: 15, count: 100 },
          wa: { cost: 20, count: 50 },
          go: { cost: 10, count: 200 }
        },
        '2': {
          tg: { cost: 12, count: 40 },
          wa: { cost: 18, count: 30 }
        },
        '6': {
          tg: { cost: 25, count: 10 }
        }
      };
    }

    const params: Record<string, string> = {};
    if (service) params.service = service;
    if (country) params.country = country;
    const url = this.buildUrl('getPrices', params);
    const res = await fetch(url);
    if (!res.ok) throw new HeroSmsError('HTTP_ERROR', `HTTP status ${res.status}`);
    const text = (await res.text()).trim();

    try {
      const data = JSON.parse(text);
      const result: Record<string, Record<string, { cost: number; count: number }>> = {};

      // Standard response format: { [countryId]: { [serviceCode]: { cost|price: number, count: number } } }
      // Or array or nested map
      for (const [cId, sMap] of Object.entries(data)) {
        if (typeof sMap === 'object' && sMap !== null) {
          result[cId] = {};
          for (const [sCode, info] of Object.entries(sMap as Record<string, any>)) {
            if (typeof info === 'object' && info !== null) {
              // Extract cost/price
              const cost = Number(info.cost ?? info.price ?? info.min ?? (typeof info.prices === 'object' ? info.prices.default : 0));
              const count = Number(info.count ?? (typeof info.counts === 'object' ? info.counts.total : 0));
              result[cId][sCode] = { cost, count };
            } else if (typeof info === 'number') {
              result[cId][sCode] = { cost: info, count: 1 };
            }
          }
        }
      }
      return result;
    } catch {
      throw new HeroSmsError(text);
    }
  }

  async requestNumber(service: string, country: string = '0'): Promise<HerosmsNumberResponse> {
    return this.getNumberV2(service, country);
  }

  async getNumberV2(service: string, country: string = '0', maxPrice?: number): Promise<HerosmsNumberResponse> {
    if (!this.apiKey) {
      // Mock mode for local dev / testing
      const mockId = `act_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const mockPhone = `+628${Math.floor(100000000 + Math.random() * 900000000)}`;
      return { activationId: mockId, phone: mockPhone, activationCost: maxPrice || 10, currency: 'RUB' };
    }

    const params: Record<string, string> = { service, country };
    if (maxPrice !== undefined) {
      params.maxPrice = String(maxPrice);
    }
    const url = this.buildUrl('getNumberV2', params);
    const res = await fetch(url);
    if (!res.ok) {
      throw new HeroSmsError('HTTP_ERROR', `HTTP status ${res.status}`);
    }
    const text = (await res.text()).trim();

    // Check JSON response
    if (text.startsWith('{')) {
      try {
        const json = JSON.parse(text);
        if (json.activationId || json.id) {
          return {
            activationId: String(json.activationId || json.id),
            phone: String(json.phoneNumber || json.phone || ''),
            activationCost: json.activationCost !== undefined ? Number(json.activationCost) : (json.cost !== undefined ? Number(json.cost) : undefined),
            currency: json.currency ? String(json.currency) : 'RUB'
          };
        }
        if (json.title || json.error || json.msg) {
          throw new HeroSmsError(json.title || json.error || json.msg, json.details || json.msg);
        }
      } catch (err) {
        if (err instanceof HeroSmsError) throw err;
      }
    }

    if (text.startsWith('ACCESS_NUMBER')) {
      const parts = text.split(':');
      return {
        activationId: parts[1],
        phone: parts[2]
      };
    }

    const errCode = text.split(':')[0];
    throw new HeroSmsError(errCode, text);
  }

  async getStatus(activationId: string): Promise<HerosmsStatusResponse> {
    if (!this.apiKey || activationId.startsWith('act_')) {
      // Mock status check: simulate SMS arriving after ~15s
      const ageMs = Date.now() - parseInt(activationId.split('_')[1] || '0', 10);
      if (ageMs > 120000) {
        return { status: 'TIMEOUT' };
      }
      if (ageMs > 10000) {
        const mockCode = Math.floor(100000 + Math.random() * 900000).toString();
        return {
          status: 'RECEIVED',
          code: mockCode,
          fullText: `Kode verifikasi Anda adalah ${mockCode}`
        };
      }
      return { status: 'WAITING_CODE' };
    }

    const url = this.buildUrl('getStatus', { id: activationId });
    const res = await fetch(url);
    if (!res.ok) {
      throw new HeroSmsError('HTTP_ERROR', `HTTP status ${res.status}`);
    }
    const text = (await res.text()).trim();

    if (text === 'STATUS_WAIT_CODE' || text === 'STATUS_WAIT_RETRY' || text === 'STATUS_WAIT_RESEND') {
      return { status: 'WAITING_CODE' };
    }
    if (text.startsWith('STATUS_OK')) {
      const parts = text.split(':');
      return {
        status: 'RECEIVED',
        code: parts[1] || '',
        fullText: text
      };
    }
    if (text === 'STATUS_CANCEL') {
      return { status: 'CANCELLED' };
    }

    throw new HeroSmsError(text);
  }

  async cancelActivation(activationId: string): Promise<boolean> {
    if (!this.apiKey || activationId.startsWith('act_')) return true;
    const url = this.buildUrl('setStatus', { id: activationId, status: '8' });
    const res = await fetch(url);
    if (!res.ok) {
      throw new HeroSmsError('HTTP_ERROR', `HTTP status ${res.status}`);
    }
    const text = (await res.text()).trim();

    if (text === 'ACCESS_CANCEL' || text === 'ACCESS_CANCEL_ALREADY' || text.includes('CANCELED')) {
      return true;
    }
    throw new HeroSmsError(text);
  }

  async finishActivation(activationId: string): Promise<boolean> {
    if (!this.apiKey || activationId.startsWith('act_')) return true;
    const url = this.buildUrl('setStatus', { id: activationId, status: '6' });
    const res = await fetch(url);
    if (!res.ok) {
      throw new HeroSmsError('HTTP_ERROR', `HTTP status ${res.status}`);
    }
    const text = (await res.text()).trim();

    if (text.includes('ACCESS_ACTIVATION') || text.includes('FINISHED') || text.includes('STATUS_OK') || text === 'ACCESS_CANCEL') {
      return true;
    }
    // Handle JSON response
    if (text.startsWith('{')) {
      try {
        const json = JSON.parse(text);
        if (json.title === 'FINISHED' || json.title === 'ACCESS_ACTIVATION' || !json.error) {
          return true;
        }
      } catch {
        // fallback
      }
    }
    throw new HeroSmsError(text);
  }

  async getBalance(): Promise<string> {
    if (!this.apiKey) return '0.00 (mock)';
    const url = this.buildUrl('getBalance');
    const res = await fetch(url);
    if (!res.ok) throw new HeroSmsError('HTTP_ERROR', `HTTP status ${res.status}`);
    const text = (await res.text()).trim();
    if (text.startsWith('ACCESS_BALANCE:')) {
      return text.split(':')[1] || '0';
    }
    throw new HeroSmsError(text);
  }
}
