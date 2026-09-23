-- Catalog metadata used by customer filters, sorting, and low-stock operations.
ALTER TABLE products ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'instant';
ALTER TABLE products ADD COLUMN validity_days INTEGER;
ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_catalog ON products(is_active, delivery_mode, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_products_type_active ON products(type, is_active);
