-- 003_feature_flags.sql - Feature flags
CREATE TABLE "feature_flags" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(100) UNIQUE NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN DEFAULT false,
    "rollout_percentage" INTEGER DEFAULT 0,
    "workspace_id" UUID,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "idx_feature_flags_name" ON "feature_flags"("name");
CREATE INDEX "idx_feature_flags_workspace_id" ON "feature_flags"("workspace_id");