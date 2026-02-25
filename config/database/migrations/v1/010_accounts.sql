-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Accounts Table
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('bank', 'savings', 'cash', 'credit_card', 'investment')),
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    color VARCHAR(20) DEFAULT '#6b7280',
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries by workspace
CREATE INDEX IF NOT EXISTS idx_accounts_workspace_id ON accounts(workspace_id);

-- Index for faster queries by user
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
