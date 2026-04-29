-- 017_seed_subscription_plans.sql - Seed subscription plans
INSERT INTO "subscription_plans" (
    "id",
    "stripe_price_id",
    "name",
    "description",
    "price_monthly",
    "price_yearly",
    "currency",
    "is_active",
    "is_featured",
    "features",
    "limits"
) VALUES 
(
    uuid_generate_v4(),
    NULL,
    'Free',
    'Perfect for getting started',
    0,
    0,
    'USD',
    true,
    false,
    '[
        {"name": "Up to 2 workspaces", "included": true},
        {"name": "Up to 5 accounts per workspace", "included": true},
        {"name": "Basic analytics", "included": true},
        {"name": "Email support", "included": true}
    ]'::jsonb,
    '{
        "workspaces": 2,
        "accounts": 5,
        "members": 3,
        "transactions": 1000
    }'::jsonb
),
(
    uuid_generate_v4(),
    'price_pro_monthly',
    'Pro Monthly',
    'For power users who want more',
    9.99,
    99.99,
    'USD',
    true,
    true,
    '[
        {"name": "Unlimited workspaces", "included": true},
        {"name": "Unlimited accounts", "included": true},
        {"name": "Advanced analytics", "included": true},
        {"name": "Export reports", "included": true},
        {"name": "Priority support", "included": true}
    ]'::jsonb,
    '{
        "workspaces": -1,
        "accounts": -1,
        "members": -1,
        "transactions": -1
    }'::jsonb
);