-- Add linked transaction IDs array column (replace single linked_transaction_id)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS linked_transaction_ids UUID[] DEFAULT '{}';

-- Drop old columns with CASCADE to handle dependent views (data already cleaned per user's request)
ALTER TABLE transactions DROP COLUMN IF EXISTS linked_transaction_id CASCADE;
ALTER TABLE transactions DROP COLUMN IF EXISTS linked_account_id CASCADE;