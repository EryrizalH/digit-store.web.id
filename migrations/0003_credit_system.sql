-- Credit system tables for user balance and transaction history

CREATE TABLE IF NOT EXISTS user_credits (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  balance REAL NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL, -- 'topup' | 'debit' | 'refund'
  amount REAL NOT NULL,
  reference_id TEXT,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
