-- 004_workspaces.sql - Workspaces
CREATE TABLE "workspaces" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) UNIQUE NOT NULL,
    "owner_id" UUID REFERENCES "users"("id") ON DELETE CASCADE,
    "currency" VARCHAR(10) DEFAULT 'USD',
    "language" VARCHAR(10) DEFAULT 'en',
    "timezone" VARCHAR(50) DEFAULT 'UTC',
    "logo" VARCHAR(500),
    "description" TEXT,
    "website" VARCHAR(500),
    "industry" VARCHAR(100),
    "size" VARCHAR(50),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP WITH TIME ZONE
);

CREATE INDEX "idx_workspaces_owner_id" ON "workspaces"("owner_id");
CREATE INDEX "idx_workspaces_slug" ON "workspaces"("slug");