-- Add total_income and total_expense columns to accounts table
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS total_income DECIMAL(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_expense DECIMAL(15, 2) DEFAULT 0;

-- Update existing accounts with calculated values from transactions
UPDATE accounts a
SET 
    total_income = COALESCE((
        SELECT SUM(t.amount)
        FROM transactions t
        WHERE t.account_id = a.id AND t.type = 'income'
    ), 0),
    total_expense = COALESCE((
        SELECT SUM(t.amount)
        FROM transactions t
        WHERE t.account_id = a.id AND t.type = 'expense'
    ), 0);
