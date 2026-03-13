-- Transaction performance indexes for cursor pagination and common queries
-- Migration: v2/002_add_transaction_indexes.sql
-- Note: Using non-concurrent indexes (safe for small-medium tables)

-- Index for account + date queries (most common - for cursor pagination)
CREATE INDEX IF NOT EXISTS idx_transactions_account_date 
ON transactions(account_id, date DESC, id DESC);

-- Index for workspace-wide queries
CREATE INDEX IF NOT EXISTS idx_transactions_workspace_date 
ON transactions(workspace_id, date DESC, id DESC);

-- Index for category filtering within accounts
CREATE INDEX IF NOT EXISTS idx_transactions_account_category 
ON transactions(account_id, category_id, date DESC);

-- Index for linked transactions (transfer queries)
CREATE INDEX IF NOT EXISTS idx_transactions_linked 
ON transactions(account_id, linked_transaction_id);

-- Index for type filtering within accounts
CREATE INDEX IF NOT EXISTS idx_transactions_account_type 
ON transactions(account_id, type, date DESC);

-- Index for workspace + account + date (dashboard queries)
CREATE INDEX IF NOT EXISTS idx_transactions_workspace_account_date 
ON transactions(workspace_id, account_id, date DESC);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_transactions_date 
ON transactions(date DESC);
