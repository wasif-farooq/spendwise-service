-- Add converted_amount column for transfer tracking
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS converted_amount DECIMAL(15, 2);
