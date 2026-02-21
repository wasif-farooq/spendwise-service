-- Add two_factor_methods column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_methods JSONB DEFAULT '[]';

-- Optional: Initialize two_factor_methods from two_factor_method if it's already set
UPDATE users 
SET two_factor_methods = jsonb_build_array(jsonb_build_object('type', two_factor_method, 'verified', TRUE))
WHERE two_factor_enabled = TRUE AND two_factor_method IS NOT NULL AND (two_factor_methods IS NULL OR two_factor_methods = '[]'::jsonb);
