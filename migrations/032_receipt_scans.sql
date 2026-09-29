-- 032_receipt_scans.sql - AI receipt scanning: scan log + monthly allowance
--
-- receipt_scans is the per-scan log (outcome, provider, model, latency and
-- token counts only; never the image or the text read from it). Successful
-- scans count toward the plan's monthly allowance.
--   workspace deleted → its scans go (CASCADE)
--   user deleted      → scans stay, anonymised (SET NULL), so account deletion
--                       keeps working and the owner's monthly count is unchanged

CREATE TABLE IF NOT EXISTS receipt_scans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    outcome VARCHAR(32) NOT NULL,
    provider VARCHAR(50),
    model VARCHAR(100),
    latency_ms INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER
);

-- The quota query: successful scans in a workspace since the start of the month.
CREATE INDEX IF NOT EXISTS idx_receipt_scans_workspace_month
    ON receipt_scans (workspace_id, created_at)
    WHERE outcome = 'success';

CREATE INDEX IF NOT EXISTS idx_receipt_scans_user ON receipt_scans (user_id);

-- Monthly allowance per plan: Free 5, every paid plan unlimited (-1, the
-- convention the other limits use).
UPDATE subscription_plans
SET limits = COALESCE(limits, '{}'::jsonb) || jsonb_build_object(
    'receiptScansPerMonth',
    CASE WHEN LOWER(name) = 'free' THEN 5 ELSE -1 END
);

-- Existing subscriptions read limits from their snapshot; give them the value
-- of their plan so the allowance applies without a re-subscribe.
UPDATE user_subscriptions us
SET limits_snapshot = COALESCE(us.limits_snapshot, '{}'::jsonb)
    || jsonb_build_object('receiptScansPerMonth', sp.limits->'receiptScansPerMonth')
FROM subscription_plans sp
WHERE sp.id = us.plan_id
  AND sp.limits ? 'receiptScansPerMonth';
