-- 010_attachments.sql - Attachments
CREATE TABLE "attachments" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "workspace_id" UUID REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "transaction_id" UUID REFERENCES "transactions"("id") ON DELETE SET NULL,
    "bucket" VARCHAR(100),
    "key" VARCHAR(500),
    "filename" VARCHAR(255) NOT NULL,
    "original_filename" VARCHAR(255),
    "content_type" VARCHAR(100),
    "mime_type" VARCHAR(100),
    "size" INTEGER,
    "metadata" JSONB DEFAULT '{}',
    "url" VARCHAR(500),
    "thumbnail_url" VARCHAR(500),
    "storage_provider" VARCHAR(50),
    "storage_key" VARCHAR(500),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP WITH TIME ZONE
);

CREATE INDEX "idx_attachments_workspace_id" ON "attachments"("workspace_id");
CREATE INDEX "idx_attachments_transaction_id" ON "attachments"("transaction_id");
CREATE INDEX "idx_attachments_user_id" ON "attachments"("user_id");