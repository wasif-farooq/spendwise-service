-- Add features_display column to existing subscription_plans table
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS features_display JSONB DEFAULT '[]';

-- Update existing plans with display names
UPDATE subscription_plans SET features_display =
    CASE id
        WHEN 'free' THEN '["Basic Financial Reports"]'::jsonb
        WHEN 'starter' THEN '["Basic Financial Reports", "Advanced Analytics & Reports", "Multi-Currency Support", "Manage Multiple Workspaces"]'::jsonb
        WHEN 'pro' THEN '["Basic Financial Reports", "Advanced Analytics & Reports", "Multi-Currency Support", "Manage Multiple Workspaces", "AI Financial Advisor", "Export Data (CSV/Excel)", "Custom Permission Overrides", "Priority Customer Support"]'::jsonb
        WHEN 'business' THEN '["Basic Financial Reports", "Advanced Analytics & Reports", "Multi-Currency Support", "Manage Multiple Workspaces", "AI Financial Advisor", "Export Data (CSV/Excel)", "Custom Permission Overrides", "Priority Customer Support", "API Access for Integrations"]'::jsonb
    END
WHERE features_display = '[]'::jsonb OR features_display IS NULL;