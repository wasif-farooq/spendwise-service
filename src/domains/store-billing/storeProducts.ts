/**
 * The one place that ties store products to our plans (P15).
 *
 * Google Play: one subscription per paid plan (`starter`, `pro`, `business`), each with
 * two base plans (`monthly`, `yearly`). RevenueCat names such a product
 * `<subscription id>:<base plan id>`, e.g. `pro:yearly`, in webhooks and offerings; its
 * REST API lists the subscription id with the base plan in `product_plan_identifier`.
 * `resolveStoreProduct` accepts both shapes.
 *
 * Prices are set in Play Console and must match the web (Paddle) catalogue:
 * subscription_plans.price_monthly / price_yearly (migrations 017 and 018):
 *   starter  4.99 / month   47.90 / year
 *   pro      9.99 / month   99.99 / year
 *   business 29.99 / month  287.90 / year   (USD)
 *
 * To add or rename a product, change STORE_PRODUCTS only. iOS (App Store) products can be
 * added here later with their own ids; nothing else is store-specific.
 */

export type StorePlanKey = 'starter' | 'pro' | 'business';
export type StoreBillingPeriod = 'monthly' | 'yearly';

export interface StoreProduct {
  plan: StorePlanKey;
  period: StoreBillingPeriod;
}

export const STORE_PRODUCTS: Readonly<Record<string, StoreProduct>> = Object.freeze({
  'starter:monthly': { plan: 'starter', period: 'monthly' },
  'starter:yearly': { plan: 'starter', period: 'yearly' },
  'pro:monthly': { plan: 'pro', period: 'monthly' },
  'pro:yearly': { plan: 'pro', period: 'yearly' },
  'business:monthly': { plan: 'business', period: 'monthly' },
  'business:yearly': { plan: 'business', period: 'yearly' },
});

/** RevenueCat's `store` values we sell through, and the payment_provider each writes. */
export const STORE_PROVIDERS: Readonly<Record<string, string>> = Object.freeze({
  PLAY_STORE: 'google_play',
});

export const GOOGLE_PLAY_PROVIDER = 'google_play';

/** Where a Play subscriber manages their subscriptions when RevenueCat gives no URL. */
export const GOOGLE_PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';

/** Paid plan order, for picking the best of several store subscriptions. */
export const PLAN_RANK: Readonly<Record<string, number>> = Object.freeze({
  free: 0,
  starter: 1,
  pro: 2,
  business: 3,
});

/**
 * `pro:yearly` → { plan: 'pro', period: 'yearly' }. `pro` + base plan `yearly` (the REST
 * API's shape) works too. Unknown ids → null (the caller logs and ignores them).
 */
export function resolveStoreProduct(
  productId: string | null | undefined,
  basePlanId?: string | null,
): StoreProduct | null {
  if (!productId) return null;
  const id = productId.trim();
  const key = id.includes(':') || !basePlanId ? id : `${id}:${basePlanId.trim()}`;
  return STORE_PRODUCTS[key] ?? null;
}

/** "Pro Monthly" → 'pro' (catalogue names carry a period suffix). */
export function planKeyOfName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase().split(/\s+/)[0] || 'free';
}
