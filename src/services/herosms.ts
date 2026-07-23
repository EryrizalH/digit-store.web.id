// ponytail: HeroSMS Client (SMS-Activate standard stub & mock fallback)

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

  async requestNumber(service: string, country: string = '0'): Promise<HerosmsNumberResponse> {
    if (!this.apiKey) {
      // Mock mode for local dev / testing
      const mockId = `act_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const mockPhone = `+628${Math.floor(100000000 + Math.random() * 900000000)}`;
      return { activationId: mockId, phone: mockPhone };
    }

    const url = `${this.baseUrl}?api_key=${this.apiKey}&action=getNumber&service=${service}&country=${country}`;
    const res = await fetch(url);
    const text = await res.text();

    if (text.startsWith('ACCESS_NUMBER')) {
      const parts = text.split(':');
      return {
        activationId: parts[1],
        phone: parts[2]
      };
    }

    throw new Error(`HeroSMS requestNumber error: ${text}`);
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

    const url = `${this.baseUrl}?api_key=${this.apiKey}&action=getStatus&id=${activationId}`;
    const res = await fetch(url);
    const text = await res.text();

    if (text === 'STATUS_WAIT_CODE') {
      return { status: 'WAITING_CODE' };
    }
    if (text.startsWith('STATUS_OK')) {
      const parts = text.split(':');
      const code = parts[1];
      return {
        status: 'RECEIVED',
        code: code,
        fullText: text
      };
    }
    if (text === 'STATUS_CANCEL') {
      return { status: 'CANCELLED' };
    }

    return { status: 'WAITING_CODE' };
  }

  async cancelActivation(activationId: string): Promise<boolean> {
    if (!this.apiKey || activationId.startsWith('act_')) return true;
    const url = `${this.baseUrl}?api_key=${this.apiKey}&action=setStatus&id=${activationId}&status=8`;
    const res = await fetch(url);
    const text = await res.text();
    return text.includes('ACCESS_CANCEL');
  }
}
