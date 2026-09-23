-- ponytail: Database indexes for query performance and scoped idempotency
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_user_idempotency ON orders(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_codes_product_used ON stock_codes(product_id, is_used);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_txn_topup_ref ON credit_transactions(reference_id) WHERE type = 'topup';
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_txn_debit_ref ON credit_transactions(reference_id) WHERE type = 'debit' AND reference_id IS NOT NULL;
