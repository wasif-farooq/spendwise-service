-- Add role_ids array column
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS role_ids UUID[] DEFAULT '{}';

-- Migrate existing role_id to role_ids array
UPDATE workspace_members SET role_ids = ARRAY[role_id] WHERE role_id IS NOT NULL;

-- Drop old role_id column
ALTER TABLE workspace_members DROP COLUMN IF EXISTS role_id;
