-- Add new account-level permissions to workspace_member_account_permissions
-- This allows for edit_account and delete_account permissions in addition to transaction permissions

-- First, update any existing records to ensure the new permission types can be stored
-- The permissions column is already TEXT[] so it can store any permission strings
-- No schema change needed, this is just documentation

-- Note: The following permissions are now supported:
-- Transaction-level: view, create, edit, delete
-- Account-level: view, edit_account, delete_account
