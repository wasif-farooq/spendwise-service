-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,
    user_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    type VARCHAR(20) NOT NULL, -- income, expense, transfer
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    description TEXT,
    date TIMESTAMP NOT NULL,
    category_id UUID,
    -- For transfers
    to_account_id UUID,
    exchange_rate DECIMAL(15, 6),
    base_amount DECIMAL(15, 2), -- Amount in USD for conversions
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_workspace_id ON transactions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_created ON transactions(account_id, created_at); -- For monthly counting
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
