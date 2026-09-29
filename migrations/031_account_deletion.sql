-- 031_account_deletion.sql - Let a user row be hard-deleted (DELETE /auth/account)
--
-- Every other table that points at users already cascades or sets NULL. These
-- four foreign keys had no ON DELETE rule, so deleting a user who ever paid or
-- redeemed a promo code failed with a foreign-key violation.
--
-- Billing records are kept for accounting and tax, but no longer name the user:
--   payments.user_id / promo_code_uses.user_id become nullable and are set to
--   NULL when the user is deleted; their subscription_id is set to NULL when the
--   user's subscription row (which cascades from users) goes away.

ALTER TABLE payments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_user_id_fkey;
ALTER TABLE payments
    ADD CONSTRAINT payments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_subscription_id_fkey;
ALTER TABLE payments
    ADD CONSTRAINT payments_subscription_id_fkey
    FOREIGN KEY (subscription_id) REFERENCES user_subscriptions(id) ON DELETE SET NULL;

ALTER TABLE promo_code_uses ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE promo_code_uses DROP CONSTRAINT IF EXISTS promo_code_uses_user_id_fkey;
ALTER TABLE promo_code_uses
    ADD CONSTRAINT promo_code_uses_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE promo_code_uses DROP CONSTRAINT IF EXISTS promo_code_uses_subscription_id_fkey;
ALTER TABLE promo_code_uses
    ADD CONSTRAINT promo_code_uses_subscription_id_fkey
    FOREIGN KEY (subscription_id) REFERENCES user_subscriptions(id) ON DELETE SET NULL;
