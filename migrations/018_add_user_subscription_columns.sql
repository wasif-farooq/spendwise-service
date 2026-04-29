-- 018_add_user_subscription_columns.sql - Fix user_subscriptions table
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "start_date" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "end_date" TIMESTAMP WITH TIME ZONE;