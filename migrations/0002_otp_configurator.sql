-- Migration 0002: HeroSMS OTP Configurator
-- Create singleton OTP pricing settings table
CREATE TABLE IF NOT EXISTS otp_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  provider_currency TEXT NOT NULL DEFAULT 'RUB',
  rate REAL NOT NULL DEFAULT 0,
  markup_percent REAL NOT NULL DEFAULT 0,
  min_price_idr REAL NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add OTP dynamic route selection and fulfilment fields to order_items
ALTER TABLE order_items ADD COLUMN service_code TEXT;
ALTER TABLE order_items ADD COLUMN service_name TEXT;
ALTER TABLE order_items ADD COLUMN country_code TEXT;
ALTER TABLE order_items ADD COLUMN country_name TEXT;
ALTER TABLE order_items ADD COLUMN max_price REAL;
ALTER TABLE order_items ADD COLUMN quote_id TEXT;
ALTER TABLE order_items ADD COLUMN fulfilment_status TEXT DEFAULT 'pending';
ALTER TABLE order_items ADD COLUMN fulfilment_error TEXT;

-- Add order item relation and provider cost to sms_activations
ALTER TABLE sms_activations ADD COLUMN order_item_id TEXT REFERENCES order_items(id);
ALTER TABLE sms_activations ADD COLUMN provider_cost REAL;
ALTER TABLE sms_activations ADD COLUMN provider_currency TEXT;

-- Unique index to prevent duplicate activations per order item at DB level
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_activations_order_item_id ON sms_activations (order_item_id) WHERE order_item_id IS NOT NULL;
