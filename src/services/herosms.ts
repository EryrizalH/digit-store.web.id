// ponytail: HeroSMS Client (SMS-Activate standard stub & mock fallback)

export class HeroSmsError extends Error {
  constructor(public code: string, message?: string) {
    super(message || `HeroSMS provider error: ${code}`);
    this.name = 'HeroSmsError';
  }
}

export interface HerosmsNumberResponse {
  activationId: string;
  phone: string;
}

export interface HerosmsStatusResponse {
  status: 'WAITING_CODE' | 'RECEIVED' | 'CANCELLED' | 'TIMEOUT';
  code?: string;
  fullText?: string;
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

  async requestNumber(service: string, country: string = '0'): Promise<HerosmsNumberResponse> {
    if (!this.apiKey) {
      // Mock mode for local dev / testing
      const mockId = `act_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const mockPhone = `+628${Math.floor(100000000 + Math.random() * 900000000)}`;
      return { activationId: mockId, phone: mockPhone };
    }

    const url = this.buildUrl('getNumber', { service, country });
    const res = await fetch(url);
    if (!res.ok) {
      throw new HeroSmsError('HTTP_ERROR', `HTTP status ${res.status}`);
    }
    const text = (await res.text()).trim();

    if (text.startsWith('ACCESS_NUMBER')) {
      const parts = text.split(':');
      return {
        activationId: parts[1],
        phone: parts[2]
      };
    }

    throw new HeroSmsError(text);
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
    // ponytail: Strict cancellation response matching
    if (text === 'ACCESS_CANCEL' || text === 'ACCESS_CANCEL_ALREADY') {
      return true;
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
