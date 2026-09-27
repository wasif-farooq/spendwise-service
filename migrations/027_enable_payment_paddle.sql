-- 027_enable_payment_paddle.sql - Enable Paddle Billing payment gateway
-- The gateway is only offered when this flag is on AND PADDLE_API_KEY /
-- PADDLE_CLIENT_TOKEN are configured (see PaymentRequestRepository.getGateways).
INSERT INTO feature_flags (key, description, enabled, rollout_percentage, created_at, updated_at)
VALUES 
    ('paymentPaddle', 'Enable Paddle Billing payment gateway for subscriptions', true, 100, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET 
    enabled = true,
    rollout_percentage = 100,
    updated_at = NOW();
