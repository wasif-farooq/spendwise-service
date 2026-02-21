-- Subscription Plans Table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR(50) PRIMARY KEY, -- 'free', 'pro', 'enterprise'
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    billing_period VARCHAR(20) NOT NULL DEFAULT 'monthly', -- 'monthly', 'yearly'
    description TEXT,
    features JSONB NOT NULL DEFAULT '[]', -- List of enabled features
    limits JSONB NOT NULL DEFAULT '{}', -- Resource limits (members, etc)
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Organization Subscriptions Table
CREATE TABLE IF NOT EXISTS organization_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
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
CREATE INDEX idx_org_subs_org_id ON organization_subscriptions(organization_id);
CREATE INDEX idx_org_subs_status ON organization_subscriptions(status);

-- Seed Initial Plans
INSERT INTO subscription_plans (id, name, price, currency, billing_period, description, features, limits) VALUES
(
    'free', 
    'Free', 
    0, 
    'USD', 
    'monthly', 
    'Perfect for getting started',
    '["basic_reporting"]',
    '{"members": 2, "accounts": 2, "organizations": 1, "custom_roles": 0}'
),
(
    'pro', 
    'Pro', 
    29, 
    'USD', 
    'monthly', 
    'For growing teams',
    '["basic_reporting", "advanced_reporting", "ai_advisor", "export_data"]',
    '{"members": 9999, "accounts": 9999, "organizations": 9999, "custom_roles": 9999}'
),
(
    'enterprise', 
    'Enterprise', 
    99, 
    'USD', 
    'monthly', 
    'For large organizations',
    '["basic_reporting", "advanced_reporting", "ai_advisor", "export_data", "sso", "audit_logs"]',
    '{"members": 9999, "accounts": 9999, "organizations": 9999, "custom_roles": 9999}'
)
ON CONFLICT (id) DO UPDATE SET 
    price = EXCLUDED.price,
    features = EXCLUDED.features,
    limits = EXCLUDED.limits;
