-- 036_store_subscriptions.sql - Google Play subscriptions through RevenueCat (P15)
--
-- The Android app sells the same plans as the web checkout through Google Play
-- Billing, with RevenueCat in between. RevenueCat tells the API about every
-- change (POST /api/v1/webhooks/revenuecat) and the app asks for a refresh
-- right after a purchase (POST /api/v1/subscription/sync). Both write the
-- user's existing user_subscriptions row with payment_provider = 'google_play'.
--
-- Store-side facts live next to the Paddle ones:
--   store_product_id               RevenueCat product id, e.g. 'pro:yearly'
--   store_original_transaction_id  Google's order id of the first purchase
--                                  (GPA.…); stays the same across renewals
--   store_management_url           where the user manages/cancels it (Play)
--   store_environment              SANDBOX or PRODUCTION
--   store_state                    active | grace | cancelled | paused |
--                                  expired | refunded | conflict
--   store_last_event_at            event time of the newest applied event, so
--                                  an older event delivered late is skipped
-- current_period_end holds the store expiry and cancel_at_period_end the
-- inverse of "will renew", as for Paddle.
--
-- revenuecat_events makes the webhook idempotent: RevenueCat retries a
-- delivery until it gets a 200, and each event id is applied once.
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS store_product_id VARCHAR(150);
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS store_original_transaction_id VARCHAR(255);
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS store_management_url TEXT;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS store_environment VARCHAR(20);
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS store_state VARCHAR(20);
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS store_last_event_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_store_original_txn
    ON user_subscriptions (store_original_transaction_id)
    WHERE store_original_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS revenuecat_events (
    event_id VARCHAR(100) PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    app_user_id VARCHAR(255),
    environment VARCHAR(20),
    outcome VARCHAR(40) NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenuecat_events_received_at ON revenuecat_events (received_at);
