-- 035_connected_accounts.sql - Connected accounts: crypto wallets (P12), later Stripe/PayPal
--
-- A connection is one external source (a wallet address on one chain family,
-- later one Stripe or PayPal account). A link (connection_accounts) ties one
-- asset of that connection (ETH on Ethereum, USDC on Polygon, ...) to exactly
-- one account, with its own sync cursor. An account can be linked only once.
--
-- Synced transactions carry the link, the provider's id for the movement and a
-- source (manual | sync | adjustment). The partial unique index makes imports
-- idempotent: a second sync of the same page inserts nothing.
--
-- Credentials and wallet addresses are stored encrypted (AES-256-GCM, see
-- src/@shared/crypto/secretBox.ts); external_ref holds a keyed hash of the
-- normalised address so the same wallet can't be connected twice to one
-- workspace without the address being readable in the table.
--
-- Ships switched off. While the flag is off every /connections route answers
-- 404 { code: 'FEATURE_DISABLED' } and the apps hide the feature:
--   connectedAccounts  connect wallets and keep accounts in sync (default off)
-- Turn it on without a release:
--   UPDATE feature_flags SET enabled = true WHERE key = 'connectedAccounts';

CREATE TABLE IF NOT EXISTS connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    provider VARCHAR(40) NOT NULL,
    kind VARCHAR(20) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    external_ref VARCHAR(128) NOT NULL,
    credentials_enc BYTEA,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    -- A sync run claims the row (status 'syncing' + this time) instead of holding a
    -- lock; a claim older than the stale timeout (10 min) can be taken over.
    sync_started_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    next_sync_at TIMESTAMPTZ,
    last_error TEXT,
    last_error_code VARCHAR(40),
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT connections_provider_check CHECK (provider IN
        ('crypto:evm', 'crypto:bitcoin', 'crypto:tron', 'crypto:solana', 'stripe', 'paypal')),
    CONSTRAINT connections_status_check CHECK (status IN
        ('active', 'syncing', 'error', 'reauth_required', 'disconnected')),
    CONSTRAINT connections_workspace_provider_ref_key UNIQUE (workspace_id, provider, external_ref)
);

-- The scheduled sync: due connections, oldest first.
CREATE INDEX IF NOT EXISTS idx_connections_next_sync
    ON connections (next_sync_at)
    WHERE status <> 'disconnected';

CREATE TABLE IF NOT EXISTS connection_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
    asset_key VARCHAR(160) NOT NULL,
    chain_id VARCHAR(40),
    currency_code VARCHAR(10) NOT NULL,
    sync_mode VARCHAR(20) NOT NULL DEFAULT 'from_today',
    sync_from TIMESTAMPTZ,
    cursor JSONB,
    last_provider_balance NUMERIC(24, 8),
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT connection_accounts_sync_mode_check CHECK (sync_mode IN ('history', 'from_today')),
    CONSTRAINT connection_accounts_connection_asset_key UNIQUE (connection_id, asset_key)
);

CREATE INDEX IF NOT EXISTS idx_connection_accounts_connection
    ON connection_accounts (connection_id);

-- Synced transactions. Deleting a link keeps the rows as plain transactions
-- unless the user asks for them to go (the service deletes them first).
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS connection_account_id UUID
        REFERENCES connection_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS external_id VARCHAR(160),
    ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_connection_external
    ON transactions (connection_account_id, external_id)
    WHERE connection_account_id IS NOT NULL AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_connection_account
    ON transactions (connection_account_id)
    WHERE connection_account_id IS NOT NULL;

-- The archive keeps the same columns, without the foreign key.
ALTER TABLE transactions_archive
    ADD COLUMN IF NOT EXISTS connection_account_id UUID,
    ADD COLUMN IF NOT EXISTS external_id VARCHAR(160),
    ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_archive_connection_external
    ON transactions_archive (connection_account_id, external_id)
    WHERE connection_account_id IS NOT NULL AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_archive_connection_account
    ON transactions_archive (connection_account_id)
    WHERE connection_account_id IS NOT NULL;

INSERT INTO feature_flags (key, description, enabled, rollout_percentage, created_at, updated_at)
VALUES
    ('connectedAccounts', 'Connected accounts: sync crypto wallets (later Stripe/PayPal) into accounts (web + mobile)', false, 100, NOW(), NOW())
ON CONFLICT (key) DO NOTHING;

-- Plan limits, counted per workspace owner:
--   connectedWallets               Free 2, Starter 10, Pro/Business unlimited (-1)
--   hasPaymentConnections          Stripe/PayPal: paid plans only
--   connectionSyncIntervalMinutes  scheduled sync: Free every 6 h, paid hourly
UPDATE subscription_plans
SET limits = COALESCE(limits, '{}'::jsonb) || jsonb_build_object(
    'connectedWallets',
    CASE WHEN LOWER(name) LIKE 'free%' THEN 2
         WHEN LOWER(name) LIKE 'starter%' THEN 10
         ELSE -1 END,
    'hasPaymentConnections',
    CASE WHEN LOWER(name) LIKE 'free%' THEN false ELSE true END,
    'connectionSyncIntervalMinutes',
    CASE WHEN LOWER(name) LIKE 'free%' THEN 360 ELSE 60 END
);

-- Existing subscriptions read limits from their snapshot; give them the values
-- of their plan so the limits apply without a re-subscribe.
UPDATE user_subscriptions us
SET limits_snapshot = COALESCE(us.limits_snapshot, '{}'::jsonb)
    || jsonb_build_object(
        'connectedWallets', sp.limits->'connectedWallets',
        'hasPaymentConnections', sp.limits->'hasPaymentConnections',
        'connectionSyncIntervalMinutes', sp.limits->'connectionSyncIntervalMinutes'
    )
FROM subscription_plans sp
WHERE sp.id = us.plan_id
  AND sp.limits ? 'connectedWallets';
