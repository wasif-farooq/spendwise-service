-- 009_transactions.sql - Transactions and archive
CREATE TABLE "transactions" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "workspace_id" UUID REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "account_id" UUID REFERENCES "accounts"("id") ON DELETE CASCADE,
    "category_id" UUID REFERENCES "categories"("id") ON DELETE SET NULL,
    "user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(15, 2) NOT NULL,
    "currency" VARCHAR(10) DEFAULT 'USD',
    "description" TEXT,
    "date" TIMESTAMP WITH TIME ZONE NOT NULL,
    "is_reconciled" BOOLEAN DEFAULT false,
    "receipt_id" UUID,
    "receipt_ids" UUID[],
    "notes" TEXT,
    "tags" TEXT[],
    "merchant" VARCHAR(255),
    "exchange_rate" DECIMAL(15, 6),
    "converted_amount" DECIMAL(15, 2),
    "base_amount" DECIMAL(15, 2),
    "category_name" VARCHAR(100),
    "linked_transaction_ids" UUID[] DEFAULT '{}',
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP WITH TIME ZONE
);

CREATE TABLE "transactions_archive" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "workspace_id" UUID,
    "account_id" UUID,
    "category_id" UUID,
    "user_id" UUID,
    "type" VARCHAR(20),
    "amount" DECIMAL(15, 2),
    "currency" VARCHAR(10),
    "description" TEXT,
    "date" TIMESTAMP WITH TIME ZONE,
    "is_reconciled" BOOLEAN,
    "receipt_id" UUID,
    "receipt_ids" UUID[],
    "notes" TEXT,
    "tags" TEXT[],
    "merchant" VARCHAR(255),
    "exchange_rate" DECIMAL(15, 6),
    "converted_amount" DECIMAL(15, 2),
    "base_amount" DECIMAL(15, 2),
    "category_name" VARCHAR(100),
    "linked_transaction_ids" UUID[] DEFAULT '{}',
    "created_at" TIMESTAMP WITH TIME ZONE,
    "updated_at" TIMESTAMP WITH TIME ZONE,
    "deleted_at" TIMESTAMP WITH TIME ZONE,
    "archived_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "idx_transactions_workspace_id" ON "transactions"("workspace_id");
CREATE INDEX "idx_transactions_account_id" ON "transactions"("account_id");
CREATE INDEX "idx_transactions_category_id" ON "transactions"("category_id");
CREATE INDEX "idx_transactions_user_id" ON "transactions"("user_id");
CREATE INDEX "idx_transactions_type" ON "transactions"("type");
CREATE INDEX "idx_transactions_date" ON "transactions"("date");
CREATE INDEX "idx_transactions_workspace_date" ON "transactions"("workspace_id", "date");
CREATE INDEX "idx_transactions_archive_workspace_id" ON "transactions_archive"("workspace_id");
CREATE INDEX "idx_transactions_archive_date" ON "transactions_archive"("date");