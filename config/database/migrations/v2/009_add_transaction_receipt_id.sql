-- Add receipt_id column to transactions table for file/receipt attachments

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_id UUID REFERENCES attachments(id) ON DELETE SET NULL;

-- Index for querying transactions by receipt
CREATE INDEX IF NOT EXISTS idx_transactions_receipt_id ON transactions(receipt_id);