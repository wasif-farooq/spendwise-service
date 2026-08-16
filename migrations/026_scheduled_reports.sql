-- 026_scheduled_reports.sql - Scheduled/recurring report configurations
CREATE TABLE IF NOT EXISTS "scheduled_reports" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "user_email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "frequency" VARCHAR(20) NOT NULL CHECK ("frequency" IN ('weekly', 'monthly')),
    "day_of_week" SMALLINT CHECK ("day_of_week" BETWEEN 0 AND 6),
    "day_of_month" SMALLINT CHECK ("day_of_month" BETWEEN 1 AND 31),
    "time_of_day" VARCHAR(5) NOT NULL DEFAULT '09:00',
    "format" VARCHAR(10) NOT NULL DEFAULT 'csv' CHECK ("format" IN ('csv', 'xlsx')),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP WITH TIME ZONE,
    "next_run_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for scheduled_reports
CREATE INDEX "idx_scheduled_reports_workspace_id" ON "scheduled_reports"("workspace_id");
CREATE INDEX "idx_scheduled_reports_user_id" ON "scheduled_reports"("user_id");
CREATE INDEX "idx_scheduled_reports_is_active" ON "scheduled_reports"("is_active");
CREATE INDEX "idx_scheduled_reports_next_run_at" ON "scheduled_reports"("next_run_at") WHERE "is_active" = true;
