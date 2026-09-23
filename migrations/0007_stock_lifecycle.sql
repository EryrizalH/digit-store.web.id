-- Explicit stock lifecycle fields for disposable codes and low-stock operations.
ALTER TABLE stock_codes ADD COLUMN status TEXT NOT NULL DEFAULT 'available';
ALTER TABLE stock_codes ADD COLUMN expires_at INTEGER;
ALTER TABLE stock_codes ADD COLUMN invalid_reason TEXT;

UPDATE stock_codes
SET status = CASE WHEN is_used = 1 THEN 'used' ELSE 'available' END
WHERE status IS NULL OR status = '';

CREATE INDEX IF NOT EXISTS idx_stock_codes_product_status ON stock_codes(product_id, status, expires_at);
