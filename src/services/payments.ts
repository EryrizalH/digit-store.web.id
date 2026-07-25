// ponytail: Clean PaymentGateway interface with Midtrans & Xendit adapters
import { PaymentGateway, CreateTransactionOptions, CreateTransactionResult, PaymentStatus } from '../types';

export class MidtransGateway implements PaymentGateway {
  name = 'midtrans';
  private serverKey: string;
  private isProduction: boolean;

  constructor(serverKey: string, isProduction: boolean = false) {
    this.serverKey = serverKey;
    this.isProduction = isProduction;
  }

  private get endpoint(): string {
    return this.isProduction
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
  }

  async createTransaction(options: CreateTransactionOptions): Promise<CreateTransactionResult> {
    if (!this.serverKey) {
      // Mock payment link for testing/demo when keys are not set
      return {
        paymentId: `MID-MOCK-${options.orderId}`,
        redirectUrl: `/checkout/simulated?orderId=${options.orderId}&provider=midtrans`,
        raw: { mock: true }
      };
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

  async verifyWebhook(payload: any, _headers: Record<string, string>): Promise<{ orderId: string; status: PaymentStatus; paymentId?: string }> {
    const orderId = payload.order_id;
    const statusCode = payload.status_code;
    const grossAmount = payload.gross_amount;
    const signatureKey = payload.signature_key;
    const transactionStatus = payload.transaction_status;
    const fraudStatus = payload.fraud_status;

    // Verify SHA-512 signature if server key is present
    if (this.serverKey && signatureKey) {
      const rawStr = `${orderId}${statusCode}${grossAmount}${this.serverKey}`;
      const encoder = new TextEncoder();
      const hashBuf = await crypto.subtle.digest('SHA-512', encoder.encode(rawStr));
      const computedSig = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (computedSig !== signatureKey) {
        throw new Error('Invalid Midtrans webhook signature');
      }
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

    return { orderId, status, paymentId: payload.transaction_id || orderId };
  }
}

export class XenditGateway implements PaymentGateway {
  name = 'xendit';
  private secretKey: string;
  private webhookToken: string;

  constructor(secretKey: string, webhookToken: string = '') {
    this.secretKey = secretKey;
    this.webhookToken = webhookToken;
  }

  async createTransaction(options: CreateTransactionOptions): Promise<CreateTransactionResult> {
    if (!this.secretKey) {
      return {
        paymentId: `XEN-MOCK-${options.orderId}`,
        redirectUrl: `/checkout/simulated?orderId=${options.orderId}&provider=xendit`,
        raw: { mock: true }
      };
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

  async verifyWebhook(payload: any, headers: Record<string, string>): Promise<{ orderId: string; status: PaymentStatus; paymentId?: string }> {
    const callbackToken = headers['x-callback-token'] || headers['X-CALLBACK-TOKEN'];
    if (this.webhookToken && callbackToken !== this.webhookToken) {
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

    return { orderId, status, paymentId: payload.id || orderId };
  }
}

export class SumopodGateway implements PaymentGateway {
  name = 'sumopod';
  private apiKey: string;
  private isProduction: boolean;
  private webhookSecret: string;

  constructor(apiKey: string, isProduction: boolean = false, webhookSecret: string = '') {
    this.apiKey = apiKey;
    this.isProduction = isProduction;
    this.webhookSecret = webhookSecret;
  }

  private get endpoint(): string {
    return this.isProduction
      ? 'https://api-pay.sumopod.com/api/v1/payments'
      : 'https://api-pay-sandbox.sumopod.com/api/v1/payments';
  }

  async createTransaction(options: CreateTransactionOptions): Promise<CreateTransactionResult> {
    if (!this.apiKey) {
      return {
        paymentId: `SUMO-MOCK-${options.orderId}`,
        redirectUrl: `/checkout/simulated?orderId=${options.orderId}&provider=sumopod`,
        raw: { mock: true }
      };
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

  async verifyWebhook(payload: any, headers: Record<string, string>, rawBody?: string): Promise<{ orderId: string; status: PaymentStatus; paymentId?: string }> {
    // Verify Svix webhook signature if webhook secret is configured
    if (this.webhookSecret) {
      const svixId = headers['svix-id'] || headers['Svix-Id'];
      const svixTimestamp = headers['svix-timestamp'] || headers['Svix-Timestamp'];
      const svixSignature = headers['svix-signature'] || headers['Svix-Signature'];

      if (!svixId || !svixTimestamp || !svixSignature) {
        throw new Error('Missing Svix webhook signature headers');
      }

      // Verify timestamp is within 5 minutes tolerance
      const now = Math.floor(Date.now() / 1000);
      const ts = parseInt(svixTimestamp, 10);
      if (Math.abs(now - ts) > 300) {
        throw new Error('Webhook timestamp too old or too far in the future');
      }

      // Compute expected signature: base64(HMAC-SHA256(secret, "{svix_id}.{timestamp}.{body}"))
      // Use the raw body string for HMAC to match the exact bytes Sumopod signed
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

      // svix-signature header may contain multiple signatures separated by spaces (versioned)
      const signatures = svixSignature.split(' ');
      const isValid = signatures.some(sig => {
        const sigValue = sig.startsWith('v1,') ? sig.slice(3) : sig;
        return sigValue === computedSig;
      });

      if (!isValid) {
        throw new Error('Invalid Sumopod webhook signature');
      }
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

    return { orderId, status, paymentId: data.payment_id || orderId };
  }
}

export function getPaymentGateway(provider: string = 'midtrans', env: any): PaymentGateway {
  if (provider.toLowerCase() === 'xendit') {
    return new XenditGateway(env.XENDIT_SECRET_KEY || '', env.XENDIT_WEBHOOK_VERIFICATION_TOKEN || '');
  }
  if (provider.toLowerCase() === 'sumopod') {
    return new SumopodGateway(env.SUMOPOD_API_KEY || '', env.SUMOPOD_IS_PRODUCTION === 'true', env.SUMOPOD_WEBHOOK_SECRET || '');
  }
  return new MidtransGateway(env.MIDTRANS_SERVER_KEY || '', env.MIDTRANS_IS_PRODUCTION === 'true');
}
