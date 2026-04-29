-- 012_subscription_plans.sql - Subscription plans
CREATE TABLE "subscription_plans" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "stripe_price_id" VARCHAR(100) UNIQUE,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "price_monthly" DECIMAL(10, 2),
    "price_yearly" DECIMAL(10, 2),
    "currency" VARCHAR(10) DEFAULT 'USD',
    "is_active" BOOLEAN DEFAULT true,
    "is_featured" BOOLEAN DEFAULT false,
    "features" JSONB,
    "limits" JSONB,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "idx_subscription_plans_stripe_price_id" ON "subscription_plans"("stripe_price_id");
CREATE INDEX "idx_subscription_plans_is_active" ON "subscription_plans"("is_active");