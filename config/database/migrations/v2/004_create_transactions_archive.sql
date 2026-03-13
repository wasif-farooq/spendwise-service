-- Transaction archival table for old data
-- Migration: v2/004_create_transactions_archive.sql

-- Create archive table
CREATE TABLE IF NOT EXISTS transactions_archive (
    id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    account_id UUID NOT NULL,
    type VARCHAR(10) NOT NULL,
    amount DECIMAL(19,4) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    category_id UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    archived_at TIMESTAMP DEFAULT NOW(),  -- When moved to archive
    linked_transaction_id UUID,
    linked_account_id UUID,
    exchange_rate DECIMAL(19,10),
    PRIMARY KEY (id)
);

-- Indexes for archive queries
CREATE INDEX IF NOT EXISTS idx_transactions_archive_workspace 
ON transactions_archive(workspace_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_archive_account 
ON transactions_archive(account_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_archive_date 
ON transactions_archive(date DESC);

-- Index for restore operations
CREATE INDEX IF NOT EXISTS idx_transactions_archive_id 
ON transactions_archive(id);

-- View for unified access (optional - for backward compatibility)
CREATE OR REPLACE VIEW transactions_all AS
SELECT 
    id, workspace_id, account_id, type, amount, currency,
    description, date, category_id, created_at, updated_at,
    linked_transaction_id, linked_account_id, exchange_rate,
    false as is_archived,
    created_at as _created_at
FROM transactions
UNION ALL
SELECT 
    id, workspace_id, account_id, type, amount, currency,
    description, date, category_id, created_at, updated_at,
    linked_transaction_id, linked_account_id, exchange_rate,
    true as is_archived,
    archived_at as _created_at
FROM transactions_archive;

-- Function to archive old transactions
CREATE OR REPLACE FUNCTION archive_transactions(p_older_than DATE, p_batch_size INTEGER DEFAULT 1000)
RETURNS TABLE(archived_count INTEGER, remaining_count INTEGER) AS $$
DECLARE
    v_archived INTEGER := 0;
BEGIN
    -- Move transactions to archive in batches
    LOOP
        WITH moved AS (
            DELETE FROM transactions 
            WHERE id IN (
                SELECT id FROM transactions 
                WHERE date < p_older_than
                ORDER BY date ASC 
                LIMIT p_batch_size
            )
            RETURNING *
        )
        INSERT INTO transactions_archive 
        SELECT *, NOW() FROM moved;

        GET DIAGNOSTICS v_archived = ROW_COUNT;
        
        IF v_archived < p_batch_size THEN
            EXIT;
        END IF;
    END LOOP;

    -- Return counts
    SELECT COUNT(*) INTO v_archived FROM transactions_archive;
    RETURN QUERY 
        SELECT COUNT(*)::INTEGER, v_archived::INTEGER 
        FROM transactions;
END;
$$ LANGUAGE plpgsql;

-- Function to restore from archive
CREATE OR REPLACE FUNCTION restore_transactions(p_transaction_ids UUID[])
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH restored AS (
        DELETE FROM transactions_archive 
        WHERE id = ANY(p_transaction_ids)
        RETURNING *
    )
    INSERT INTO transactions 
    SELECT id, workspace_id, account_id, type, amount, currency,
           description, date, category_id, created_at, updated_at,
           linked_transaction_id, linked_account_id, exchange_rate
    FROM restored;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;
