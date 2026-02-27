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
    CONSTRAINT unique_currency_pair UNIQUE (base_currency, target_currency),
    
    -- Index for faster lookups
    INDEX idx_exchange_rates_base (base_currency),
    INDEX idx_exchange_rates_fetched (fetched_at)
);

-- Add comment
COMMENT ON TABLE exchange_rates IS 'Stores exchange rates fetched from external APIs';

-- Create or update function for upsert
CREATE OR REPLACE FUNCTION upsert_exchange_rate(
    p_base_currency VARCHAR(3),
    p_target_currency VARCHAR(3),
    p_rate DECIMAL(20, 10)
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO exchange_rates (base_currency, target_currency, rate, fetched_at)
    VALUES (p_base_currency, p_target_currency, p_rate, NOW())
    ON CONFLICT (base_currency, target_currency) 
    DO UPDATE SET 
        rate = EXCLUDED.rate,
        fetched_at = NOW();
END;
$$ LANGUAGE plpgsql;
