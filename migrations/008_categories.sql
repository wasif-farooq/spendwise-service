-- 008_categories.sql - Categories
CREATE TABLE "categories" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "workspace_id" UUID REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "name" VARCHAR(255) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "color" VARCHAR(20),
    "icon" VARCHAR(50),
    "is_income" BOOLEAN DEFAULT false,
    "is_system" BOOLEAN DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP WITH TIME ZONE
);

CREATE INDEX "idx_categories_workspace_id" ON "categories"("workspace_id");
CREATE INDEX "idx_categories_type" ON "categories"("type");
CREATE INDEX "idx_categories_is_system" ON "categories"("is_system");