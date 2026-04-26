-- Add is_default column to track workspace creator
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
CREATE INDEX idx_workspace_members_is_default ON workspace_members(is_default);