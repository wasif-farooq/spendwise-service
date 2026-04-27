-- Fix subscription_plans table: add yearly_price and update features_display

-- 1. Add yearly_price column if not exists
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS yearly_price NUMERIC(10, 2) DEFAULT 0;

-- 2. Update data based on plan name (since IDs are UUIDs)
UPDATE subscription_plans SET 
    yearly_price = CASE name
        WHEN 'Free' THEN 0
        WHEN 'Starter' THEN 47.90
        WHEN 'Pro' THEN 143.90
        WHEN 'Business' THEN 287.90
    END,
    features_display = CASE name
        WHEN 'Free' THEN '["Basic Financial Reports"]'::jsonb
        WHEN 'Starter' THEN '["Basic Financial Reports", "Advanced Analytics & Reports", "Multi-Currency Support", "Manage Multiple Workspaces"]'::jsonb
        WHEN 'Pro' THEN '["Basic Financial Reports", "Advanced Analytics & Reports", "Multi-Currency Support", "Manage Multiple Workspaces", "AI Financial Advisor", "Export Data (CSV/Excel)", "Custom Permission Overrides", "Priority Customer Support"]'::jsonb
        WHEN 'Business' THEN '["Basic Financial Reports", "Advanced Analytics & Reports", "Multi-Currency Support", "Manage Multiple Workspaces", "AI Financial Advisor", "Export Data (CSV/Excel)", "Custom Permission Overrides", "Priority Customer Support", "API Access for Integrations"]'::jsonb
    END,
    features = CASE name
        WHEN 'Free' THEN '["basic_reporting"]'::jsonb
        WHEN 'Starter' THEN '["basic_reporting", "advanced_reporting", "exchange_rates", "manage_workspace"]'::jsonb
        WHEN 'Pro' THEN '["basic_reporting", "advanced_reporting", "exchange_rates", "manage_workspace", "ai_advisor", "export_data", "permission_overrides", "priority_support"]'::jsonb
        WHEN 'Business' THEN '["basic_reporting", "advanced_reporting", "exchange_rates", "manage_workspace", "ai_advisor", "export_data", "permission_overrides", "priority_support", "api_access"]'::jsonb
    END,
    limits = CASE name
        WHEN 'Free' THEN '{"members": 2, "accounts": 2, "workspaces": 1, "custom_roles": 2, "transactions_per_account": 100, "has_exchange_rates": false, "has_permission_overrides": false, "has_ai_advisor": false}'::jsonb
        WHEN 'Starter' THEN '{"members": 5, "accounts": 5, "workspaces": 2, "custom_roles": 5, "transactions_per_account": 500, "has_exchange_rates": true, "has_permission_overrides": false, "has_ai_advisor": false}'::jsonb
        WHEN 'Pro' THEN '{"members": 10, "accounts": 10, "workspaces": 5, "custom_roles": 10, "transactions_per_account": 2000, "has_exchange_rates": true, "has_permission_overrides": true, "has_ai_advisor": true}'::jsonb
        WHEN 'Business' THEN '{"members": -1, "accounts": 25, "workspaces": -1, "custom_roles": -1, "transactions_per_account": -1, "has_exchange_rates": true, "has_permission_overrides": true, "has_ai_advisor": true}'::jsonb
    END,
    price = CASE name
        WHEN 'Free' THEN 0
        WHEN 'Starter' THEN 4.99
        WHEN 'Pro' THEN 14.99
        WHEN 'Business' THEN 29.99
    END
WHERE name IN ('Free', 'Starter', 'Pro', 'Business');