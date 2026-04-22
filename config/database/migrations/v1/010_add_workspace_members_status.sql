-- Add status column to workspace_members
ALTER TABLE workspace_members 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'invited', 'removed'));

ALTER TABLE workspace_members 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;