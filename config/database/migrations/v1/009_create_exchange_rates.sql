-- Migration: Create exchange_rates table
-- Run with: npm run migrate

-- Create exchange_rates table
CREATE TABLE IF NOT EXISTS exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency VARCHAR(3) NOT NULL,
    target_currency VARCHAR(3) NOT NULL,
    rate DECIMAL(20, 10) NOT NULL,
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint on base + target currency pair
    CONSTRAINT unique_currency_pair UNIQUE (base_currency, target_currency)
);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_exchange_rates_base ON exchange_rates(base_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_fetched ON exchange_rates(fetched_at);

-- Add comment
COMMENT ON TABLE exchange_rates IS 'Stores exchange rates fetched from external APIs';
