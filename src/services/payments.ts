import { PaymentGateway, CreateTransactionOptions, CreateTransactionResult, PaymentStatus } from '../types';

function constantTimeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export class MidtransGateway implements PaymentGateway {
  name = 'midtrans';
  private serverKey: string;
  private isProduction: boolean;
  private allowMock: boolean;

  constructor(serverKey: string, isProduction: boolean = false, allowMock: boolean = false) {
    this.serverKey = serverKey;
    this.isProduction = isProduction;
    this.allowMock = allowMock;
  }

  private get endpoint(): string {
    return this.isProduction
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
  }

  async createTransaction(options: CreateTransactionOptions): Promise<CreateTransactionResult> {
    if (!this.serverKey) {
      if (this.allowMock) {
        return {
          paymentId: `MID-MOCK-${options.orderId}`,
          redirectUrl: `/checkout/simulated?orderId=${options.orderId}&provider=midtrans`,
          raw: { mock: true }
        };
      }
      throw new Error('Midtrans server key is not configured');
    }

    const authHeader = 'Basic ' + btoa(this.serverKey + ':');
    const payload = {
      transaction_details: {
        order_id: options.orderId,
        gross_amount: Math.round(options.amount)
      },
      customer_details: {
        email: options.customerEmail
      },
      item_details: options.items.map(item => ({
        id: item.id,
        price: Math.round(item.price),
        quantity: item.quantity,
        name: item.name.substring(0, 50)
      }))
    };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Midtrans API error (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    return {
      paymentId: data.token || options.orderId,
      redirectUrl: data.redirect_url,
      raw: data
    };
  }

  async verifyWebhook(payload: any, _headers: Record<string, string>): Promise<{ orderId: string; status: PaymentStatus; paymentId?: string; grossAmount?: number }> {
    if (!this.serverKey) {
      throw new Error('Midtrans server key is not configured');
    }

    const orderId = payload.order_id;
    const statusCode = payload.status_code;
    const grossAmount = payload.gross_amount;
    const signatureKey = payload.signature_key;
    const transactionStatus = payload.transaction_status;
    const fraudStatus = payload.fraud_status;

    if (!signatureKey) {
      throw new Error('Missing Midtrans signature_key');
    }

    const rawStr = `${orderId}${statusCode}${grossAmount}${this.serverKey}`;
    const encoder = new TextEncoder();
    const hashBuf = await crypto.subtle.digest('SHA-512', encoder.encode(rawStr));
    const computedSig = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (!constantTimeStringEqual(computedSig, signatureKey)) {
      throw new Error('Invalid Midtrans webhook signature');
    }

    let status: PaymentStatus = 'pending';
    if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
      if (fraudStatus === 'accept' || !fraudStatus) {
        status = 'paid';
      }
    } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') {
      status = 'failed';
    } else if (transactionStatus === 'refund') {
      status = 'refunded';
    }

    return { orderId, status, paymentId: payload.transaction_id || orderId, grossAmount: Number(grossAmount) };
  }
}

export class XenditGateway implements PaymentGateway {
  name = 'xendit';
  private secretKey: string;
  private webhookToken: string;
  private allowMock: boolean;

  constructor(secretKey: string, webhookToken: string = '', allowMock: boolean = false) {
    this.secretKey = secretKey;
    this.webhookToken = webhookToken;
    this.allowMock = allowMock;
  }

  async createTransaction(options: CreateTransactionOptions): Promise<CreateTransactionResult> {
    if (!this.secretKey) {
      if (this.allowMock) {
        return {
          paymentId: `XEN-MOCK-${options.orderId}`,
          redirectUrl: `/checkout/simulated?orderId=${options.orderId}&provider=xendit`,
          raw: { mock: true }
        };
      }
      throw new Error('Xendit secret key is not configured');
    }

    const authHeader = 'Basic ' + btoa(this.secretKey + ':');
    const payload = {
      external_id: options.orderId,
      amount: Math.round(options.amount),
      payer_email: options.customerEmail,
      description: `Order ${options.orderId} at Digital Store`,
      items: options.items.map(item => ({
        name: item.name,
        price: Math.round(item.price),
        quantity: item.quantity
      }))
    };

    const res = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Xendit API error (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    return {
      paymentId: data.id || options.orderId,
      redirectUrl: data.invoice_url,
      raw: data
    };
  }

  async verifyWebhook(payload: any, headers: Record<string, string>): Promise<{ orderId: string; status: PaymentStatus; paymentId?: string; grossAmount?: number }> {
    if (!this.webhookToken) {
      throw new Error('Xendit webhook token is not configured');
    }

    const callbackToken = headers['x-callback-token'] || headers['X-CALLBACK-TOKEN'];
    if (!callbackToken || !constantTimeStringEqual(callbackToken, this.webhookToken)) {
      throw new Error('Invalid Xendit callback token');
    }

    const orderId = payload.external_id || payload.order_id;
    const xenditStatus = payload.status;

    let status: PaymentStatus = 'pending';
    if (xenditStatus === 'PAID' || xenditStatus === 'SETTLED') {
      status = 'paid';
    } else if (xenditStatus === 'EXPIRED') {
      status = 'failed';
    }

    return { orderId, status, paymentId: payload.id || orderId, grossAmount: Number(payload.amount) };
  }
}

export class QrisGateway implements PaymentGateway {
  name = 'qris';
  private apiBaseUrl: string;
  private apiKey: string;
  private webhookSecret: string;

  constructor(apiBaseUrl: string, apiKey: string, webhookSecret: string = '') {
    // ponytail: sanitize quotes/whitespace commonly copied into cloud secrets
    this.apiBaseUrl = (apiBaseUrl || '').trim().replace(/\/+$/, '');
    this.apiKey = (apiKey || '').trim().replace(/^["']|["']$/g, '');
    this.webhookSecret = (webhookSecret || '').trim().replace(/^["']|["']$/g, '');
  }

  async createTransaction(options: CreateTransactionOptions): Promise<CreateTransactionResult> {
    if (!this.apiBaseUrl) {
      throw new Error('QRIS API base URL is not configured');
    }
    if (!this.apiKey) {
      throw new Error('QRIS API key is not configured');
    }

    const amount = Math.round(options.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('QRIS transaction amount is invalid');
    }

    const res = await fetch(`${this.apiBaseUrl}/create-qris`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({
        amount,
        reference_id: options.orderId
      })
    });

    if (!res.ok) {
      let errMsg = `QRIS API error (${res.status})`;
      try {
        const errBody = await res.json() as any;
        if (errBody?.message) {
          errMsg += `: ${errBody.message}`;
        }
      } catch {
        // ignore parse error if response is not JSON
      }
      throw new Error(errMsg);
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new Error('QRIS API returned invalid JSON');
    }

    const responseObject = body !== null && typeof body === 'object' ? body : null;
    const dataValue = responseObject && 'data' in responseObject ? responseObject.data : null;
    const dataObject = dataValue !== null && typeof dataValue === 'object' ? dataValue : null;
    const qrisId = dataObject && 'qris_id' in dataObject ? dataObject.qris_id : undefined;
    const trxId = dataObject && 'trx_id' in dataObject ? dataObject.trx_id : undefined;
    const qrisUrl = dataObject && 'qris_url' in dataObject ? dataObject.qris_url : undefined;
    const qrisCode = dataObject && 'qris_code' in dataObject && typeof dataObject.qris_code === 'string' ? dataObject.qris_code : undefined;
    const expiresAt = dataObject && 'expires_at' in dataObject && typeof dataObject.expires_at === 'string' ? dataObject.expires_at : undefined;
    if (typeof qrisId !== 'string' || !qrisId ||
      typeof trxId !== 'string' || !trxId ||
      typeof qrisUrl !== 'string' || !qrisUrl) {
      throw new Error('QRIS API response is missing transaction fields');
    }

    return {
      paymentId: qrisId,
      redirectUrl: qrisUrl,
      qrString: qrisCode,
      expiresAt,
      raw: body
    };
  }

  async fetchQrImage(paymentId: string): Promise<Response> {
    if (!this.apiBaseUrl) {
      throw new Error('QRIS API base URL is not configured');
    }
    return fetch(`${this.apiBaseUrl}/qr/${encodeURIComponent(paymentId)}?format=raw`);
  }

  async verifyWebhook(payload: any, headers: Record<string, string>): Promise<{ orderId: string; status: PaymentStatus; paymentId?: string; grossAmount?: number }> {
    if (!this.webhookSecret) {
      throw new Error('QRIS webhook secret is not configured');
    }

    const callbackSecret = headers['x-webhook-secret'] || headers['X-Webhook-Secret'];
    if (!callbackSecret || !constantTimeStringEqual(callbackSecret, this.webhookSecret)) {
      throw new Error('Invalid QRIS webhook secret');
    }

    const orderId = typeof payload?.reference_id === 'string' ? payload.reference_id.trim() : '';
    if (!orderId) {
      throw new Error('Missing QRIS reference_id');
    }

    const paymentId = typeof payload?.trx_id === 'string' && payload.trx_id.trim()
      ? payload.trx_id.trim()
      : typeof payload?.qris_id === 'string' && payload.qris_id.trim()
        ? payload.qris_id.trim()
        : '';
    if (!paymentId) {
      throw new Error('Missing QRIS payment identifier');
    }

    const rawAmount = payload?.amount;
    if (rawAmount === undefined || rawAmount === null || (typeof rawAmount === 'string' && !rawAmount.trim())) {
      throw new Error('Missing QRIS amount');
    }
    const grossAmount = Number(rawAmount);
    if (!Number.isFinite(grossAmount)) {
      throw new Error('Invalid QRIS amount');
    }

    const rawStatus = typeof payload?.status === 'string' ? payload.status.trim() : '';
    let status: PaymentStatus;
    if (rawStatus === 'paid' || rawStatus === 'PAID') {
      status = 'paid';
    } else if (rawStatus === 'failed' || rawStatus === 'FAILED' || rawStatus === 'EXPIRED' || rawStatus === 'expired') {
      status = 'failed';
    } else if (rawStatus === 'pending' || rawStatus === 'PENDING') {
      status = 'pending';
    } else {
      throw new Error('Unknown QRIS webhook status');
    }

    return { orderId, status, paymentId, grossAmount };
  }
}

export class SumopodGateway implements PaymentGateway {
  name = 'sumopod';
  private apiKey: string;
  private isProduction: boolean;
  private webhookSecret: string;
  private allowMock: boolean;

  constructor(apiKey: string, isProduction: boolean = false, webhookSecret: string = '', allowMock: boolean = false) {
    this.apiKey = apiKey;
    this.isProduction = isProduction;
    this.webhookSecret = webhookSecret;
    this.allowMock = allowMock;
  }

  private get endpoint(): string {
    return this.isProduction
      ? 'https://api-pay.sumopod.com/api/v1/payments'
      : 'https://api-pay-sandbox.sumopod.com/api/v1/payments';
  }

  async createTransaction(options: CreateTransactionOptions): Promise<CreateTransactionResult> {
    if (!this.apiKey) {
      if (this.allowMock) {
        return {
          paymentId: `SUMO-MOCK-${options.orderId}`,
          redirectUrl: `/checkout/simulated?orderId=${options.orderId}&provider=sumopod`,
          raw: { mock: true }
        };
      }
      throw new Error('Sumopod API key is not configured');
    }

    const payload = {
      order_id: options.orderId,
      amount: Math.round(options.amount),
      currency: 'IDR',
      expires_in_hours: 24,
      success_return_url: `${options.successReturnUrl || '/topup/success'}`,
      cancel_return_url: `${options.cancelReturnUrl || '/topup/cancel'}`,
      payment_method_type_code: 'QRIS'
    };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Sumopod API error (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    return {
      paymentId: data.data?.payment_id || options.orderId,
      redirectUrl: data.data?.payment_url || data.data?.checkout_url,
      raw: data
    };
  }

  async verifyWebhook(payload: any, headers: Record<string, string>, rawBody?: string): Promise<{ orderId: string; status: PaymentStatus; paymentId?: string; grossAmount?: number }> {
    if (!this.webhookSecret) {
      throw new Error('Sumopod webhook secret is not configured');
    }

    const svixId = headers['svix-id'] || headers['Svix-Id'];
    const svixTimestamp = headers['svix-timestamp'] || headers['Svix-Timestamp'];
    const svixSignature = headers['svix-signature'] || headers['Svix-Signature'];

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new Error('Missing Svix webhook signature headers');
    }

    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(svixTimestamp, 10);
    if (Math.abs(now - ts) > 300) {
      throw new Error('Webhook timestamp too old or too far in the future');
    }

    const secret = this.webhookSecret.startsWith('whsec_')
      ? this.webhookSecret.slice(6)
      : this.webhookSecret;

    const bodyForSigning = rawBody || JSON.stringify(payload);
    const signedContent = `${svixId}.${svixTimestamp}.${bodyForSigning}`;
    const encoder = new TextEncoder();
    const secretBytes = Uint8Array.from(atob(secret), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(signedContent));
    const computedSig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

    const signatures = svixSignature.split(' ');
    const isValid = signatures.some(sig => {
      const sigValue = sig.startsWith('v1,') ? sig.slice(3) : sig;
      return constantTimeStringEqual(sigValue, computedSig);
    });

    if (!isValid) {
      throw new Error('Invalid Sumopod webhook signature');
    }

    const eventType = payload.event_type;
    const data = payload.data || {};
    const orderId = data.order_id;

    let status: PaymentStatus = 'pending';
    if (eventType === 'payment.completed') {
      status = 'paid';
    } else if (eventType === 'payment.failed') {
      status = 'failed';
    } else if (eventType === 'payment.expired') {
      status = 'failed';
    }

    return { orderId, status, paymentId: data.payment_id || orderId, grossAmount: Number(data.amount) };
  }
}

export function getPaymentGateway(provider: string = 'midtrans', env: any): PaymentGateway {
  // ponytail: require both APP_ENV === 'development' and ALLOW_MOCK_PAYMENTS === 'true' before allowing mocks
  const allowMock = env?.APP_ENV === 'development' && env?.ALLOW_MOCK_PAYMENTS === 'true';
  const p = (provider || '').toLowerCase();
  if (p === 'qris') {
    return new QrisGateway(env?.QRIS_API_BASE_URL || '', env?.QRIS_API_KEY || '', env?.QRIS_WEBHOOK_SECRET || '');
  }
  if (p === 'xendit') {
    return new XenditGateway(env?.XENDIT_SECRET_KEY || '', env?.XENDIT_WEBHOOK_VERIFICATION_TOKEN || '', allowMock);
  }
  if (p === 'sumopod') {
    return new SumopodGateway(env?.SUMOPOD_API_KEY || '', env?.SUMOPOD_IS_PRODUCTION === 'true', env?.SUMOPOD_WEBHOOK_SECRET || '', allowMock);
  }
  return new MidtransGateway(env?.MIDTRANS_SERVER_KEY || '', env?.MIDTRANS_IS_PRODUCTION === 'true', allowMock);
}
