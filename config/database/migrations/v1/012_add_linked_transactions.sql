-- Add linked transaction columns to transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS linked_transaction_id UUID;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS linked_account_id UUID;
