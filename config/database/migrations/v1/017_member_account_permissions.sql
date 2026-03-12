-- Member Account Permissions Table
-- Stores granular permissions for workspace members on specific accounts

CREATE TABLE IF NOT EXISTS workspace_member_account_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES workspace_members(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    permissions TEXT[] DEFAULT '{}',
    denied_permissions TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(member_id, account_id)
);

-- Index for faster lookups by member
CREATE INDEX IF NOT EXISTS idx_member_account_permissions_member_id 
    ON workspace_member_account_permissions(member_id);

-- Index for faster lookups by account
CREATE INDEX IF NOT EXISTS idx_member_account_permissions_account_id 
    ON workspace_member_account_permissions(account_id);
