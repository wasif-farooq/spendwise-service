-- 025_report_requests.sql - Report generation history
CREATE TABLE IF NOT EXISTS "report_requests" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "user_email" VARCHAR(255) NOT NULL,
    "date_range" VARCHAR(50) NOT NULL,
    "custom_start_date" DATE,
    "custom_end_date" DATE,
    "format" VARCHAR(10) NOT NULL DEFAULT 'csv',
    "delivery_method" VARCHAR(20) NOT NULL DEFAULT 'email',
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "filename" VARCHAR(500),
    "file_size" BIGINT,
    "error_message" TEXT,
    "generated_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for report_requests
CREATE INDEX "idx_report_requests_workspace_id" ON "report_requests"("workspace_id");
CREATE INDEX "idx_report_requests_user_id" ON "report_requests"("user_id");
CREATE INDEX "idx_report_requests_status" ON "report_requests"("status");
CREATE INDEX "idx_report_requests_created_at" ON "report_requests"("created_at" DESC);
