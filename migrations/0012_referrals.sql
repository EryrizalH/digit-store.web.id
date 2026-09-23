ALTER TABLE users ADD COLUMN referral_code TEXT;
ALTER TABLE orders ADD COLUMN referral_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL;
