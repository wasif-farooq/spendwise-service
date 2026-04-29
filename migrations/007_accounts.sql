-- 007_accounts.sql - Accounts
CREATE TABLE "accounts" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "workspace_id" UUID REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "balance" DECIMAL(15, 2) DEFAULT 0,
    "currency" VARCHAR(10) DEFAULT 'USD',
    "color" VARCHAR(20),
    "icon" VARCHAR(50),
    "is_active" BOOLEAN DEFAULT true,
    "is_on_budget" BOOLEAN DEFAULT true,
    "last_activity" TIMESTAMP WITH TIME ZONE,
    "total_income" DECIMAL(15, 2) DEFAULT 0,
    "total_expense" DECIMAL(15, 2) DEFAULT 0,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP WITH TIME ZONE
);

CREATE INDEX "idx_accounts_workspace_id" ON "accounts"("workspace_id");
CREATE INDEX "idx_accounts_type" ON "accounts"("type");
CREATE INDEX "idx_accounts_is_active" ON "accounts"("is_active");
CREATE INDEX "idx_accounts_user_id" ON "accounts"("user_id");