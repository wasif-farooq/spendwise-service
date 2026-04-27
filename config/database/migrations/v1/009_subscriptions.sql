-- Subscription Plans Table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR(50) PRIMARY KEY, -- 'free', 'starter', 'pro', 'business'
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    yearly_price DECIMAL(10, 2) DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    billing_period VARCHAR(20) NOT NULL DEFAULT 'monthly', -- 'monthly', 'yearly'
    description TEXT,
    features JSONB NOT NULL DEFAULT '[]', -- List of enabled features
    features_display JSONB NOT NULL DEFAULT '[]', -- Human-readable feature names
    limits JSONB NOT NULL DEFAULT '{}', -- Resource limits (members, etc)
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Subscriptions Table (linked to user, not workspace)
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id VARCHAR(50) NOT NULL REFERENCES subscription_plans(id),
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'cancelled', 'past_due', 'trialing'
    
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    current_period_end TIMESTAMP,
    cancelled_at TIMESTAMP,
    trial_ends_at TIMESTAMP,
    
    -- Payment Provider Details (Mock 2Checkout)
    payment_provider VARCHAR(50), -- '2checkout', etc
    merchant_subscription_id VARCHAR(100), -- ID in external system
    
    -- Snapshotting for Grandfathering
    features_snapshot JSONB NOT NULL DEFAULT '[]',
    limits_snapshot JSONB NOT NULL DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX idx_user_subs_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subs_status ON user_subscriptions(status);

-- Seed Initial Plans (4 plans: free, starter, pro, business)
INSERT INTO subscription_plans (id, name, price, yearly_price, currency, billing_period, description, features, features_display, limits) VALUES
(
    'free', 
    'Free', 
    0, 
    0,
    'USD', 
    'monthly', 
    'Perfect for getting started',
    '["basic_reporting"]',
    '["Basic Financial Reports"]',
    '{"members": 2, "accounts": 2, "workspaces": 1, "custom_roles": 2, "transactions_per_account": 100, "has_exchange_rates": false, "has_permission_overrides": false, "has_ai_advisor": false}'
),
(
    'starter', 
    'Starter', 
    4.99, 
    47.90,
    'USD', 
    'monthly', 
    'For individuals who want more',
    '["basic_reporting", "advanced_reporting", "exchange_rates", "manage_workspace"]',
    '["Basic Financial Reports", "Advanced Analytics & Reports", "Multi-Currency Support", "Manage Multiple Workspaces"]',
    '{"members": 5, "accounts": 5, "workspaces": 2, "custom_roles": 5, "transactions_per_account": 500, "has_exchange_rates": true, "has_permission_overrides": false, "has_ai_advisor": false}'
),
(
    'pro', 
    'Pro', 
    14.99, 
    143.90,
    'USD', 
    'monthly', 
    'For power users and small teams',
    '["basic_reporting", "advanced_reporting", "exchange_rates", "manage_workspace", "ai_advisor", "export_data", "permission_overrides", "priority_support"]',
    '["Basic Financial Reports", "Advanced Analytics & Reports", "Multi-Currency Support", "Manage Multiple Workspaces", "AI Financial Advisor", "Export Data (CSV/Excel)", "Custom Permission Overrides", "Priority Customer Support"]',
    '{"members": 10, "accounts": 10, "workspaces": 5, "custom_roles": 10, "transactions_per_account": 2000, "has_exchange_rates": true, "has_permission_overrides": true, "has_ai_advisor": true}'
),
(
    'business', 
    'Business', 
    29.99, 
    287.90,
    'USD', 
    'monthly', 
    'For growing businesses',
    '["basic_reporting", "advanced_reporting", "exchange_rates", "manage_workspace", "ai_advisor", "export_data", "permission_overrides", "priority_support", "api_access"]',
    '["Basic Financial Reports", "Advanced Analytics & Reports", "Multi-Currency Support", "Manage Multiple Workspaces", "AI Financial Advisor", "Export Data (CSV/Excel)", "Custom Permission Overrides", "Priority Customer Support", "API Access for Integrations"]',
    '{"members": -1, "accounts": 25, "workspaces": -1, "custom_roles": -1, "transactions_per_account": -1, "has_exchange_rates": true, "has_permission_overrides": true, "has_ai_advisor": true}'
)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    yearly_price = EXCLUDED.yearly_price,
    description = EXCLUDED.description,
    features = EXCLUDED.features,
    features_display = EXCLUDED.features_display,
    limits = EXCLUDED.limits;