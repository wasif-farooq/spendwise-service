-- 011_exchange_rates.sql - Exchange rates
CREATE TABLE "exchange_rates" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "base_currency" VARCHAR(10) NOT NULL,
    "target_currency" VARCHAR(10) NOT NULL,
    "rate" DECIMAL(15, 8) NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("base_currency", "target_currency", "date")
);

CREATE INDEX "idx_exchange_rates_date" ON "exchange_rates"("date");
CREATE INDEX "idx_exchange_rates_currencies" ON "exchange_rates"("base_currency", "target_currency");