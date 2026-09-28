-- 029_mobile_external_checkout_flag.sql - Gate the mobile app's web checkout link
--
-- The mobile app opens the Paddle web checkout for upgrades. App Store and
-- Google Play rules on external purchase links vary by platform and region,
-- so the Upgrade button reads these public flags (GET /api/v1/feature-flags)
-- and can be hidden without shipping a release:
--   mobileExternalCheckout         master switch for every platform
--   mobileExternalCheckoutIos      iOS only (false hides it on iOS)
--   mobileExternalCheckoutAndroid  Android only (false hides it on Android)
-- The app shows the Upgrade button only when the master switch and its
-- platform's flag are both on; with the flags off it tells the user to manage
-- their plan on the web, without a purchase link.
INSERT INTO feature_flags (key, description, enabled, rollout_percentage, created_at, updated_at)
VALUES
    ('mobileExternalCheckout', 'Mobile app: show Upgrade buttons that open the web checkout', true, 100, NOW(), NOW()),
    ('mobileExternalCheckoutIos', 'Mobile app (iOS): show Upgrade buttons that open the web checkout', true, 100, NOW(), NOW()),
    ('mobileExternalCheckoutAndroid', 'Mobile app (Android): show Upgrade buttons that open the web checkout', true, 100, NOW(), NOW())
ON CONFLICT (key) DO NOTHING;
