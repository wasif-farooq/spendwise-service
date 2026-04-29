-- 002_user_preferences.sql - User preferences
CREATE TABLE "user_preferences" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "user_id" UUID UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
    "currency" VARCHAR(10) DEFAULT 'USD',
    "language" VARCHAR(10) DEFAULT 'en',
    "timezone" VARCHAR(50) DEFAULT 'UTC',
    "date_format" VARCHAR(20) DEFAULT 'MM/DD/YYYY',
    "first_day_of_week" INTEGER DEFAULT 0,
    "theme" VARCHAR(20) DEFAULT 'light',
    "color" VARCHAR(20) DEFAULT 'blue',
    "notifications" JSONB DEFAULT '{}',
    "notifications_email" BOOLEAN DEFAULT true,
    "notifications_push" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "idx_user_preferences_user_id" ON "user_preferences"("user_id");