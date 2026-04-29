-- 015_add_two_factor_methods.sql - Add missing two_factor_methods column
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "two_factor_methods" JSONB DEFAULT '[]';