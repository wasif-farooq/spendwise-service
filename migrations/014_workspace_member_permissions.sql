-- 014_workspace_member_permissions.sql - Workspace member account permissions
CREATE TABLE "workspace_member_account_permissions" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "member_id" UUID REFERENCES "workspace_members"("id") ON DELETE CASCADE,
    "account_id" UUID REFERENCES "accounts"("id") ON DELETE CASCADE,
    "permissions" TEXT[] DEFAULT '{}',
    "denied_permissions" TEXT[] DEFAULT '{}',
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("member_id", "account_id")
);

CREATE INDEX "idx_workspace_member_account_permissions_member_id" ON "workspace_member_account_permissions"("member_id");
CREATE INDEX "idx_workspace_member_account_permissions_account_id" ON "workspace_member_account_permissions"("account_id");