-- 019_add_user_subscription_extra_columns.sql - Add missing columns for subscription
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "features_snapshot" JSONB;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "limits_snapshot" JSONB;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "payment_provider" VARCHAR(50);
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "merchant_subscription_id" VARCHAR(100);