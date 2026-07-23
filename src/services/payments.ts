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

export function getPaymentGateway(provider: string = 'midtrans', env: any): PaymentGateway {
  if (provider.toLowerCase() === 'xendit') {
    return new XenditGateway(env.XENDIT_SECRET_KEY || '', env.XENDIT_WEBHOOK_VERIFICATION_TOKEN || '');
  }
  return new MidtransGateway(env.MIDTRANS_SERVER_KEY || '', env.MIDTRANS_IS_PRODUCTION === 'true');
}
