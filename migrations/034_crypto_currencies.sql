-- 034_crypto_currencies.sql - Cryptocurrencies as account/transaction currencies
--
-- Crypto amounts need 8 decimals (0.00012345 BTC) and crypto rates need many
-- more (1 USD = 0.0000087 BTC), so the money and rate columns are widened:
--   money  NUMERIC(15,2) -> NUMERIC(24,8)   (16 integer digits, 8 decimals)
--   rates  NUMERIC(15,8) / NUMERIC(15,6) -> NUMERIC(30,15)
-- Widening never loses data: existing values keep their digits.
-- The type change rewrites these tables once (small on staging).
--
-- Crypto ships switched off. While the flag is off, creating an account or a
-- transaction in a crypto currency (or switching an account to one) answers
-- 400 { code: 'CURRENCY_NOT_SUPPORTED' }; accounts already in crypto keep
-- working. The web and mobile apps, which read the public flags
-- (GET /api/v1/feature-flags), hide the crypto currencies:
--   crypto  offer cryptocurrencies as account currencies (default off)
-- Turn it on without a release:
--   UPDATE feature_flags SET enabled = true WHERE key = 'crypto';

ALTER TABLE "accounts"
    ALTER COLUMN "balance" TYPE NUMERIC(24, 8),
    ALTER COLUMN "total_income" TYPE NUMERIC(24, 8),
    ALTER COLUMN "total_expense" TYPE NUMERIC(24, 8);

ALTER TABLE "transactions"
    ALTER COLUMN "amount" TYPE NUMERIC(24, 8),
    ALTER COLUMN "converted_amount" TYPE NUMERIC(24, 8),
    ALTER COLUMN "base_amount" TYPE NUMERIC(24, 8),
    ALTER COLUMN "exchange_rate" TYPE NUMERIC(30, 15);

ALTER TABLE "transactions_archive"
    ALTER COLUMN "amount" TYPE NUMERIC(24, 8),
    ALTER COLUMN "converted_amount" TYPE NUMERIC(24, 8),
    ALTER COLUMN "base_amount" TYPE NUMERIC(24, 8),
    ALTER COLUMN "exchange_rate" TYPE NUMERIC(30, 15);

ALTER TABLE "exchange_rates"
    ALTER COLUMN "rate" TYPE NUMERIC(30, 15);

INSERT INTO feature_flags (key, description, enabled, rollout_percentage, created_at, updated_at)
VALUES
    ('crypto', 'Cryptocurrencies as account and transaction currencies (web + mobile)', false, 100, NOW(), NOW())
ON CONFLICT (key) DO NOTHING;
