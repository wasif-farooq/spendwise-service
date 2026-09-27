-- 018_update_subscription_plans_analytics.sql - Add analyticsHistoryDays to subscription plans

-- Update Free plan with analyticsHistoryDays
UPDATE "subscription_plans"
SET "limits" = '{
    "workspaces": 2,
    "accounts": 5,
    "members": 3,
    "transactions": 1000,
    "analyticsHistoryDays": 30,
    "transactionHistoryMonths": 3,
    "categoriesPerWorkspace": 10,
    "customRoles": 2,
    "invitations": 3
}'::jsonb
WHERE LOWER("name") = 'free';

-- Update Pro plan with analyticsHistoryDays
UPDATE "subscription_plans"
SET "limits" = '{
    "workspaces": -1,
    "accounts": -1,
    "members": -1,
    "transactions": -1,
    "analyticsHistoryDays": 180,
    "transactionHistoryMonths": 12,
    "categoriesPerWorkspace": 50,
    "customRoles": 10,
    "invitations": 20,
    "hasExchangeRates": true,
    "hasPermissionOverrides": true,
    "hasAIAdvisor": true
}'::jsonb
WHERE LOWER("name") LIKE '%pro%';

-- Insert Starter plan
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
    'price_starter_monthly',
    'Starter Monthly',
    'For individuals who want more',
    4.99,
    47.90,
    'USD',
    true,
    false,
    '[
        {"name": "Up to 5 accounts per workspace", "included": true},
        {"name": "Up to 2 workspaces", "included": true},
        {"name": "Up to 5 team members", "included": true},
        {"name": "Advanced analytics", "included": true},
        {"name": "Exchange rates", "included": true},
        {"name": "Email support", "included": true}
    ]'::jsonb,
    '{
        "workspaces": 2,
        "accounts": 5,
        "members": 5,
        "transactions": 500,
        "analyticsHistoryDays": 90,
        "transactionHistoryMonths": 6,
        "categoriesPerWorkspace": 20,
        "customRoles": 5,
        "invitations": 5,
        "hasExchangeRates": true,
        "hasPermissionOverrides": false,
        "hasAIAdvisor": false
    }'::jsonb
);

-- Insert Business plan
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
    'price_business_monthly',
    'Business Monthly',
    'For growing businesses',
    29.99,
    287.90,
    'USD',
    true,
    false,
    '[
        {"name": "Unlimited workspaces", "included": true},
        {"name": "Unlimited accounts", "included": true},
        {"name": "Unlimited team members", "included": true},
        {"name": "Advanced analytics", "included": true},
        {"name": "Exchange rates", "included": true},
        {"name": "AI Advisor", "included": true},
        {"name": "Export data", "included": true},
        {"name": "Permission overrides", "included": true},
        {"name": "API access", "included": true},
        {"name": "24/7 dedicated support", "included": true}
    ]'::jsonb,
    '{
        "workspaces": -1,
        "accounts": -1,
        "members": -1,
        "transactions": -1,
        "analyticsHistoryDays": -1,
        "transactionHistoryMonths": -1,
        "categoriesPerWorkspace": -1,
        "customRoles": -1,
        "invitations": -1,
        "hasExchangeRates": true,
        "hasPermissionOverrides": true,
        "hasAIAdvisor": true
    }'::jsonb
);