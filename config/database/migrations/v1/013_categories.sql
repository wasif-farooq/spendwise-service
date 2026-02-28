-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'all', -- income, expense, all
    icon VARCHAR(100),
    color VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_categories_workspace_id ON categories(workspace_id);
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);

-- Insert default categories for a workspace (can be seeded later)
-- This is optional - the frontend has default categories as fallback
