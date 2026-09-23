export interface Env {
  DB: D1Database;
  FILES_BUCKET: R2Bucket;
  RATE_LIMIT_KV: KVNamespace;
  ASSETS: Fetcher;
  
  // Environment variables & secrets
  PAYMENT_PROVIDER?: string; // 'midtrans' | 'xendit'
  APP_URL?: string;
  APP_ENV?: string;
  ALLOW_SIMULATED_PAYMENTS?: string;
  ALLOW_MOCK_PAYMENTS?: string;
  
  MIDTRANS_SERVER_KEY?: string;
  MIDTRANS_CLIENT_KEY?: string;
  MIDTRANS_IS_PRODUCTION?: string;
  
  XENDIT_SECRET_KEY?: string;
  XENDIT_WEBHOOK_VERIFICATION_TOKEN?: string;
  
  SUMOPOD_API_KEY?: string;
  SUMOPOD_IS_PRODUCTION?: string;
  SUMOPOD_WEBHOOK_SECRET?: string;
  
  HEROSMS_API_KEY?: string;
  HEROSMS_BASE_URL?: string;
  HEROSMS_WEBHOOK_SECRET?: string;
  
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  
  JWT_SECRET?: string;
  NOTIFICATION_WEBHOOK_URL?: string;
}

export type Role = 'user' | 'admin';
export type ProductType = 'file' | 'code' | 'herosms';
export type DeliveryMode = 'instant' | 'manual';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type DeliveryStatus = 'awaiting_payment' | 'processing' | 'fulfilled' | 'failed' | 'refunded';
export type ActivationStatus = 'WAITING_CODE' | 'RECEIVED' | 'CANCELLED' | 'TIMEOUT' | 'COMPLETED';
export type CreditTransactionType = 'topup' | 'topup_pending' | 'debit' | 'refund';

export interface CreditTransaction {
  id: string;
  user_id: string;
  type: CreditTransactionType;
  amount: number;
  reference_id?: string | null;
  description?: string | null;
  created_at: string;
}

export interface UserCredit {
  user_id: string;
  balance: number;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  password_hash?: string | null;
  role: Role;
  google_id?: string | null;
  is_guest?: number;
  referral_code?: string | null;
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
  image_key?: string | null;
  artwork_url?: string | null;
  herosms_service?: string | null;
  herosms_country?: string | null;
  delivery_mode?: DeliveryMode | null;
  validity_days?: number | null;
  low_stock_threshold?: number | null;
  is_featured?: number;
  sort_order?: number;
  is_active: number;
  created_at: string;
  stock_count?: number;
  sales_count?: number;
  is_low_stock?: boolean;
}

export interface StockCode {
  id: string;
  product_id: string;
  code: string;
  is_used: number;
  status?: 'available' | 'reserved' | 'used' | 'expired' | 'invalid' | null;
  expires_at?: number | null;
  invalid_reason?: string | null;
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
  coupon_code?: string | null;
  discount_amount?: number;
  delivery_status?: DeliveryStatus;
  failed_item_count?: number;
  pending_item_count?: number;
  fulfilled_item_count?: number;
}

// Public customer-facing order item (no internal provider max_price)
export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_type: ProductType;
  product_slug?: string | null;
  product_description?: string | null;
  product_artwork_url?: string | null;
  price: number;
  quantity: number;
  service_code?: string | null;
  service_name?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  quote_id?: string | null;
  fulfilment_status?: 'pending' | 'processing' | 'fulfilled' | 'failed' | 'refunded' | null;
  fulfilment_error?: string | null;
}

// Internal server-side order item record
export interface InternalOrderItem extends OrderItem {
  max_price?: number | null;
}

export interface OrderStockAllocation {
  id: string;
  order_item_id: string;
  stock_code_id: string;
  code: string;
  product_name?: string;
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

// Public customer-facing activation (no internal provider costs or herosms_id)
export interface SmsActivation {
  id: string;
  order_item_id?: string | null;
  order_id: string;
  user_id: string;
  herosms_phone: string;
  herosms_service: string;
  herosms_country: string;
  status: ActivationStatus;
  sms_code?: string | null;
  sms_text?: string | null;
  created_at: string;
  updated_at: string;
}

// Internal server-side activation record
export interface InternalSmsActivation extends SmsActivation {
  herosms_id: string;
  provider_cost?: number | null;
  provider_currency?: string | null;
}

export interface OtpSettings {
  id: number;
  enabled: number;
  provider_currency: string;
  rate: number;
  markup_percent: number;
  min_price_idr: number;
  updated_at: string;
}

export interface OtpQuote {
  quoteId: string;
  serviceCode: string;
  serviceName: string;
  countryCode: string;
  countryName: string;
  sellingPriceIdr: number;
  expiresAt: number;
  availableCount: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  serviceCode?: string;
  serviceName?: string;
  countryCode?: string;
  countryName?: string;
  quoteId?: string;
  expiresAt?: number;
  price?: number; // Quoted selling price for OTP
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  action: string;
  ip_address?: string | null;
  details?: string | null;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  order_id: string;
  user_id: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved';
  created_at: string;
  updated_at: string;
}

// Payment Gateway Interface
export interface CreateTransactionOptions {
  orderId: string;
  amount: number;
  customerEmail: string;
  items: Array<{ id: string; name: string; price: number; quantity: number }>;
  successReturnUrl?: string;
  cancelReturnUrl?: string;
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
  verifyWebhook(payload: any, headers: Record<string, string>, rawBody?: string): Promise<{ orderId: string; status: PaymentStatus; paymentId?: string; grossAmount?: number }>;
}
