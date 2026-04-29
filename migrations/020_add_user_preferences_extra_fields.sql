-- 020_add_user_preferences_extra_fields.sql - Add colorScheme and layout to user_preferences
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "color_scheme" VARCHAR(20) DEFAULT 'blue';
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "layout" VARCHAR(50) DEFAULT 'sidebar-left';