-- Digital Store D1 Database Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  google_id TEXT UNIQUE,
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
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_codes (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  is_used INTEGER DEFAULT 0,
  order_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  total_amount REAL NOT NULL,
  payment_provider TEXT NOT NULL, -- 'midtrans' | 'xendit'
  payment_status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'paid' | 'failed' | 'refunded'
  payment_id TEXT,
  idempotency_key TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

-- Seed initial admin & categories if empty
INSERT OR IGNORE INTO categories (id, name, slug) VALUES ('cat_software', 'Software & Script', 'software-script');
INSERT OR IGNORE INTO categories (id, name, slug) VALUES ('cat_vouchers', 'Voucher & Lisensi', 'voucher-lisensi');
INSERT OR IGNORE INTO categories (id, name, slug) VALUES ('cat_sms', 'Aktivasi HeroSMS', 'herosms-activation');

-- Default admin user password: Admin123! (hash: SHA-256 with salt demo)
INSERT OR IGNORE INTO users (id, email, password_hash, role) VALUES 
('usr_admin', 'admin@digit-store.web.id', 'ad158336ed607824ac64bdf29c14e52f162cbffe2d4ee5a8ae3cb325ff4fcff9:salt123', 'admin');
