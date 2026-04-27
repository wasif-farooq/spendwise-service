-- Update plan IDs to use readable names instead of UUIDs

-- Step 1: Temporarily alter FK constraint to be deferrable
ALTER TABLE user_subscriptions DROP CONSTRAINT user_subscriptions_plan_id_fkey;
ALTER TABLE user_subscriptions ADD CONSTRAINT user_subscriptions_plan_id_fkey 
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT DEFERRABLE;

-- Step 2: Set transaction to defer constraint checking
SET CONSTRAINTS user_subscriptions_plan_id_fkey DEFERRED;

-- Step 3: Update user_subscriptions first (to any value, it will be validated at commit)
UPDATE user_subscriptions 
SET plan_id = CASE 
    WHEN plan_id = '62a4f839-2089-4d72-b1b2-420babe0206b' THEN 'free'
    WHEN plan_id = '5e05d7eb-3025-4f8a-ba96-970c10796891' THEN 'starter'
    WHEN plan_id = '01aa26b0-c82b-4fed-a0be-3ff2f13ec05a' THEN 'pro'
    WHEN plan_id = '11b09101-79fc-4fd9-9fa0-f5019bf3e957' THEN 'business'
    ELSE plan_id
END
WHERE plan_id IN ('62a4f839-2089-4d72-b1b2-420babe0206b', '5e05d7eb-3025-4f8a-ba96-970c10796891', '01aa26b0-c82b-4fed-a0be-3ff2f13ec05a', '11b09101-79fc-4fd9-9fa0-f5019bf3e957');

-- Step 4: Update subscription_plans IDs
UPDATE subscription_plans SET id = 
    CASE name
        WHEN 'Free' THEN 'free'
        WHEN 'Starter' THEN 'starter'
        WHEN 'Pro' THEN 'pro'
        WHEN 'Business' THEN 'business'
    END
WHERE name IN ('Free', 'Starter', 'Pro', 'Business');

-- Step 5: Reset constraint (not deferred)
SET CONSTRAINTS user_subscriptions_plan_id_fkey IMMEDIATE;