-- Digital Store D1 Database Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  google_id TEXT UNIQUE,
  is_guest INTEGER NOT NULL DEFAULT 0,
  referral_code TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES categories(id),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  type TEXT NOT NULL, -- 'file' | 'code' | 'herosms'
  r2_key TEXT,
  image_key TEXT,
  herosms_service TEXT,
  herosms_country TEXT,
  delivery_mode TEXT NOT NULL DEFAULT 'instant', -- 'instant' | 'manual'
  validity_days INTEGER,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  is_featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_codes (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  is_used INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available', -- 'available' | 'reserved' | 'used' | 'expired' | 'invalid'
  expires_at INTEGER,
  invalid_reason TEXT,
  order_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  total_amount REAL NOT NULL,
  payment_provider TEXT NOT NULL, -- 'qris' | 'midtrans' | 'xendit' | 'sumopod' | 'credit'
  payment_status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'paid' | 'failed' | 'refunded'
  payment_id TEXT,
  coupon_code TEXT,
  discount_amount REAL NOT NULL DEFAULT 0,
  referral_code TEXT,
  idempotency_key TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value REAL NOT NULL,
  min_order_amount REAL NOT NULL DEFAULT 0,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  starts_at DATETIME,
  ends_at DATETIME,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discount_amount REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bundle_discounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  product_ids TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value REAL NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'in_app',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  product_type TEXT NOT NULL,
  price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  service_code TEXT,
  service_name TEXT,
  country_code TEXT,
  country_name TEXT,
  max_price REAL,
  quote_id TEXT,
  fulfilment_status TEXT DEFAULT 'pending',
  fulfilment_error TEXT
);

CREATE TABLE IF NOT EXISTS otp_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  provider_currency TEXT NOT NULL DEFAULT 'RUB',
  rate REAL NOT NULL DEFAULT 0,
  markup_percent REAL NOT NULL DEFAULT 0,
  min_price_idr REAL NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_stock_allocations (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL REFERENCES order_items(id),
  stock_code_id TEXT NOT NULL REFERENCES stock_codes(id),
  code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS file_entitlements (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  download_token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sms_activations (
  id TEXT PRIMARY KEY,
  order_item_id TEXT REFERENCES order_items(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  herosms_id TEXT NOT NULL,
  herosms_phone TEXT NOT NULL,
  herosms_service TEXT NOT NULL,
  herosms_country TEXT NOT NULL,
  provider_cost REAL,
  provider_currency TEXT,
  status TEXT NOT NULL DEFAULT 'WAITING_CODE',
  sms_code TEXT,
  sms_text TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_activations_order_item_id ON sms_activations (order_item_id) WHERE order_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  ip_address TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'in_progress' | 'resolved'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  verified_purchase INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_credits (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL, -- 'topup' | 'topup_pending' | 'debit' | 'refund'
  amount INTEGER NOT NULL,
  reference_id TEXT,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial categories if empty
INSERT OR IGNORE INTO categories (id, name, slug) VALUES ('cat_software', 'Software & Script', 'software-script');
INSERT OR IGNORE INTO categories (id, name, slug) VALUES ('cat_vouchers', 'Voucher & Lisensi', 'voucher-lisensi');
INSERT OR IGNORE INTO categories (id, name, slug) VALUES ('cat_sms', 'Aktivasi HeroSMS', 'herosms-activation');

-- Security and performance indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_user_idempotency ON orders(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_codes_product_used ON stock_codes(product_id, is_used);
CREATE INDEX IF NOT EXISTS idx_stock_codes_product_status ON stock_codes(product_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_products_catalog ON products(is_active, delivery_mode, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_products_type_active ON products(type, is_active);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_coupons_active_code ON coupons(code, is_active, starts_at, ends_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_redemptions_order ON coupon_redemptions(order_id);
CREATE INDEX IF NOT EXISTS idx_bundle_discounts_active ON bundle_discounts(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at, created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_order_id ON support_tickets(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON product_reviews(product_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_reviews_order_product ON product_reviews(order_id, product_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_txn_topup_ref ON credit_transactions(reference_id) WHERE type = 'topup';
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_txn_debit_ref ON credit_transactions(reference_id) WHERE type = 'debit' AND reference_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_txn_refund_ref ON credit_transactions(reference_id) WHERE type = 'refund' AND reference_id IS NOT NULL;
