-- Migration to populate 'target' for existing email 2FA methods
-- This ensures that the new logic, which relies on 'target', has a default value (user's primary email).

WITH updated_methods AS (
    SELECT 
        id,
        jsonb_agg(
            CASE 
                WHEN m->>'type' = 'email' AND m->>'target' IS NULL THEN 
                    m || jsonb_build_object('target', users.email)
                ELSE 
                    m 
            END
        ) as new_methods
    FROM users, jsonb_array_elements(two_factor_methods) AS m
    GROUP BY id
)
UPDATE users
SET two_factor_methods = um.new_methods
FROM updated_methods um
WHERE users.id = um.id AND users.two_factor_methods IS NOT NULL AND users.two_factor_methods != '[]'::jsonb;
