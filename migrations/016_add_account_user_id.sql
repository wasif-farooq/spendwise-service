-- 016_add_account_user_id.sql - Add user_id column for legacy compatibility
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "user_id" UUID;