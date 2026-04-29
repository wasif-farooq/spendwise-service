-- 006_workspace_invitations.sql - Workspace invitations
CREATE TABLE "workspace_invitations" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "workspace_id" UUID REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "email" VARCHAR(255) NOT NULL,
    "role_id" UUID REFERENCES "workspace_roles"("id") ON DELETE SET NULL,
    "role_ids" UUID[] DEFAULT '{}',
    "account_permissions" JSONB DEFAULT '{}',
    "invited_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "status" VARCHAR(20) DEFAULT 'pending',
    "token" VARCHAR(255) UNIQUE NOT NULL,
    "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP WITH TIME ZONE
);

CREATE INDEX "idx_workspace_invitations_workspace_id" ON "workspace_invitations"("workspace_id");
CREATE INDEX "idx_workspace_invitations_email" ON "workspace_invitations"("email");
CREATE INDEX "idx_workspace_invitations_token" ON "workspace_invitations"("token");
CREATE INDEX "idx_workspace_invitations_status" ON "workspace_invitations"("status");