-- 028_payments_provider_reference.sql - Provider-neutral payment references
-- payments was Stripe-shaped (stripe_invoice_id). Other providers (Paddle) record
-- their charge id here; the unique index makes recording a charge idempotent
-- (ON CONFLICT (provider, provider_payment_id)) across webhook replays and the
-- browser confirm call. NULLs are distinct, so existing Stripe rows are unaffected.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider VARCHAR(50);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_payment_id VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_payment_id
    ON payments (provider, provider_payment_id);
