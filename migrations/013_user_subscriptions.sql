-- 013_user_subscriptions.sql - User subscriptions
CREATE TABLE "user_subscriptions" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "user_id" UUID REFERENCES "users"("id") ON DELETE CASCADE,
    "plan_id" UUID REFERENCES "subscription_plans"("id") ON DELETE SET NULL,
    "status" VARCHAR(50) DEFAULT 'active',
    "billing_cycle" VARCHAR(20) DEFAULT 'monthly',
    "stripe_subscription_id" VARCHAR(100),
    "stripe_customer_id" VARCHAR(100),
    "current_period_start" TIMESTAMP WITH TIME ZONE,
    "current_period_end" TIMESTAMP WITH TIME ZONE,
    "cancel_at_period_end" BOOLEAN DEFAULT false,
    "cancelled_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "idx_user_subscriptions_user_id" ON "user_subscriptions"("user_id");
CREATE INDEX "idx_user_subscriptions_plan_id" ON "user_subscriptions"("plan_id");
CREATE INDEX "idx_user_subscriptions_status" ON "user_subscriptions"("status");