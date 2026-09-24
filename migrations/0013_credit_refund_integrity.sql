CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_txn_refund_ref ON credit_transactions(reference_id) WHERE type = 'refund' AND reference_id IS NOT NULL;
