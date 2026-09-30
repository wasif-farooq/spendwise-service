-- 033_receipt_scan_flag.sql - Gate receipt scanning behind a feature flag
--
-- Receipt scanning (POST /v1/:workspaceId/ai/receipt-scan and its /usage
-- route) ships switched off. While the flag is off both routes answer
-- 404 { code: 'FEATURE_DISABLED' }, and the web and mobile apps, which read
-- the public flags (GET /api/v1/feature-flags), hide the Scan receipt button
-- and quick action:
--   receiptScan  show and serve receipt scanning (default off)
-- Turn it on without a release:
--   UPDATE feature_flags SET enabled = true WHERE key = 'receiptScan';
INSERT INTO feature_flags (key, description, enabled, rollout_percentage, created_at, updated_at)
VALUES
    ('receiptScan', 'Receipt scanning: AI prefill of transactions from a photo (web + mobile)', false, 100, NOW(), NOW())
ON CONFLICT (key) DO NOTHING;
