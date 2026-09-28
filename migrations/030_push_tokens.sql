-- 030_push_tokens.sql - Expo push tokens registered by the mobile app
--
-- The mobile app registers its Expo push token after sign-in
-- (POST /api/v1/notifications/push-tokens) and removes it on logout
-- (DELETE /api/v1/notifications/push-tokens/:token). A token identifies one
-- app install, so it is unique: registering it again, possibly as another
-- user on the same device, moves it to that user. Nothing sends notifications
-- yet; this only stores the tokens so a sender can be added later.
CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    platform VARCHAR(10) NOT NULL CHECK (platform IN ('ios', 'android')),
    device_name VARCHAR(100),
    app_version VARCHAR(30),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens (user_id);
