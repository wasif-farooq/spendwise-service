-- 037_android_external_checkout_off.sql - Web checkout link off on Android by default
--
-- From P15 the Android app sells subscriptions through Google Play Billing.
-- Migration 029 seeded mobileExternalCheckoutAndroid = true, which shows a
-- link to the web (Paddle) checkout next to the Play purchase. Google Play
-- only allows that link in countries and programmes it has approved (user
-- choice billing / external offers, after enrolment), so it now defaults to
-- OFF on Android. iOS (mobileExternalCheckoutIos) and the master switch
-- (mobileExternalCheckout) are not touched.
--
-- Turn it back on only after enrolling in a Play programme that allows it
-- for every country the app is offered in:
--   UPDATE feature_flags SET enabled = true WHERE key = 'mobileExternalCheckoutAndroid';
UPDATE feature_flags
   SET enabled = false, updated_at = NOW()
 WHERE key = 'mobileExternalCheckoutAndroid';
