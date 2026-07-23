export interface Env {
  DB: D1Database;
  FILES_BUCKET: R2Bucket;
  RATE_LIMIT_KV: KVNamespace;
  ASSETS: Fetcher;
  
  // Environment variables & secrets
  PAYMENT_PROVIDER?: string; // 'midtrans' | 'xendit'
  APP_URL?: string;
  
  MIDTRANS_SERVER_KEY?: string;
  MIDTRANS_CLIENT_KEY?: string;
  MIDTRANS_IS_PRODUCTION?: string;
  
  XENDIT_SECRET_KEY?: string;
  XENDIT_WEBHOOK_VERIFICATION_TOKEN?: string;
  
  HEROSMS_API_KEY?: string;
  HEROSMS_BASE_URL?: string;
  
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  
  JWT_SECRET?: string;
}

export type Role = 'user' | 'admin';
export type ProductType = 'file' | 'code' | 'herosms';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type ActivationStatus = 'WAITING_CODE' | 'RECEIVED' | 'CANCELLED' | 'TIMEOUT';

export interface User {
  id: string;
  email: string;
  password_hash?: string | null;
  role: Role;
  google_id?: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  expires_at: number;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Product {
  id: string;
  category_id?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  price: number;
  type: ProductType;
  r2_key?: string | null;
  herosms_service?: string | null;
  herosms_country?: string | null;
  is_active: number;
  created_at: string;
  stock_count?: number;
}

export interface StockCode {
  id: string;
  product_id: string;
  code: string;
  is_used: number;
  order_id?: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  total_amount: number;
  payment_provider: string;
  payment_status: PaymentStatus;
  payment_id?: string | null;
  idempotency_key?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_type: ProductType;
  price: number;
  quantity: number;
}

export interface OrderStockAllocation {
  id: string;
  order_item_id: string;
  stock_code_id: string;
  code: string;
}

export interface FileEntitlement {
  id: string;
  order_id: string;
  user_id: string;
  product_id: string;
  download_token: string;
  expires_at: number;
  created_at: string;
}

export interface SmsActivation {
  id: string;
  order_id: string;
  user_id: string;
  herosms_id: string;
  herosms_phone: string;
  herosms_service: string;
  herosms_country: string;
  status: ActivationStatus;
  sms_code?: string | null;
  sms_text?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  action: string;
  ip_address?: string | null;
  details?: string | null;
  created_at: string;
}

// Payment Gateway Interface
export interface CreateTransactionOptions {
  orderId: string;
  amount: number;
  customerEmail: string;
  items: Array<{ id: string; name: string; price: number; quantity: number }>;
}

export interface CreateTransactionResult {
  paymentId: string;
  redirectUrl?: string;
  qrCodeUrl?: string;
  raw?: any;
}

export interface PaymentGateway {
  name: string;
  createTransaction(options: CreateTransactionOptions): Promise<CreateTransactionResult>;
  verifyWebhook(payload: any, headers: Record<string, string>): Promise<{ orderId: string; status: PaymentStatus; paymentId?: string }>;
}
