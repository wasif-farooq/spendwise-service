-- 038_transaction_limits.sql - Free 300 transactions, Starter 1,000
--
-- Migrations 017/018 gave Free 1,000 transactions and Starter (the cheapest
-- paid plan) only 500, so paying gave you less. Owner decision 2026-11-02:
-- Free 300, Starter 1,000. Pro and Business stay unlimited (-1).
--
-- Subscriptions keep a copy of their plan's limits (limits_snapshot), so the
-- copies on Free and Starter subscriptions are updated too.
UPDATE subscription_plans
   SET limits = jsonb_set(limits, '{transactions}', '300'::jsonb), updated_at = NOW()
 WHERE name = 'Free';

UPDATE subscription_plans
   SET limits = jsonb_set(limits, '{transactions}', '1000'::jsonb), updated_at = NOW()
 WHERE name ILIKE 'Starter%';

UPDATE user_subscriptions s
   SET limits_snapshot = jsonb_set(s.limits_snapshot, '{transactions}', p.limits -> 'transactions'),
       updated_at = NOW()
  FROM subscription_plans p
 WHERE s.plan_id = p.id
   AND (p.name = 'Free' OR p.name ILIKE 'Starter%')
   AND s.limits_snapshot ? 'transactions';
