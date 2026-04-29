-- 005_workspace_roles_and_members.sql - Workspace roles and members
CREATE TABLE "workspace_roles" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "workspace_id" UUID REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] DEFAULT '{}',
    "is_default" BOOLEAN DEFAULT false,
    "is_system" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("workspace_id", "name")
);

CREATE TABLE "workspace_members" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "workspace_id" UUID REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "user_id" UUID REFERENCES "users"("id") ON DELETE CASCADE,
    "role_id" UUID REFERENCES "workspace_roles"("id") ON DELETE SET NULL,
    "role_ids" UUID[] DEFAULT '{}',
    "status" VARCHAR(20) DEFAULT 'active',
    "is_default" BOOLEAN DEFAULT false,
    "denied_permissions" TEXT[] DEFAULT '{}',
    "joined_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("workspace_id", "user_id")
);

CREATE INDEX "idx_workspace_roles_workspace_id" ON "workspace_roles"("workspace_id");
CREATE INDEX "idx_workspace_members_workspace_id" ON "workspace_members"("workspace_id");
CREATE INDEX "idx_workspace_members_user_id" ON "workspace_members"("user_id");
CREATE INDEX "idx_workspace_members_role_id" ON "workspace_members"("role_id");