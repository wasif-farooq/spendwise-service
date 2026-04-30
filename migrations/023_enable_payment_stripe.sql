-- 023_enable_payment_stripe.sql - Enable Stripe payment gateway
INSERT INTO feature_flags (name, description, enabled, rollout_percentage, created_at, updated_at)
VALUES 
    ('paymentStripe', 'Enable Stripe payment gateway for subscriptions', true, 100, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET 
    enabled = true,
    rollout_percentage = 100,
    updated_at = NOW();