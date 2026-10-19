import {
  PLAN_RANK,
  STORE_PROVIDERS,
  StoreBillingPeriod,
  StorePlanKey,
  resolveStoreProduct,
} from './storeProducts';

/**
 * Pure mapping from RevenueCat's two views of a purchase (a webhook event, or the
 * subscriber record from its REST API) to one `StoreSubscriptionState` that the service
 * writes into user_subscriptions. No I/O here, so every rule is unit-tested directly.
 *
 * RevenueCat references:
 *   webhook event types and fields  https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
 *   GET /v1/subscribers/{id}        https://www.revenuecat.com/docs/api-v1#tag/customers
 */

/** What RevenueCat posts: `{ api_version, event: {...} }`. Only the fields we read. */
export interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  product_id?: string | null;
  new_product_id?: string | null;
  entitlement_ids?: string[] | null;
  period_type?: string | null;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
  auto_resume_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  environment?: 'SANDBOX' | 'PRODUCTION' | string | null;
  store?: string | null;
  transaction_id?: string | null;
  original_transaction_id?: string | null;
  cancel_reason?: string | null;
  expiration_reason?: string | null;
  price?: number | null;
  price_in_purchased_currency?: number | null;
  currency?: string | null;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
}

/** One entry of `subscriber.subscriptions` in GET /v1/subscribers/{id}. */
export interface RevenueCatSubscriberSubscription {
  expires_date?: string | null;
  purchase_date?: string | null;
  original_purchase_date?: string | null;
  store?: string | null;
  is_sandbox?: boolean | null;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  grace_period_expires_date?: string | null;
  refunded_at?: string | null;
  auto_resume_date?: string | null;
  product_plan_identifier?: string | null;
  store_transaction_id?: string | null;
}

export interface RevenueCatSubscriber {
  original_app_user_id?: string | null;
  management_url?: string | null;
  subscriptions?: Record<string, RevenueCatSubscriberSubscription> | null;
}

/**
 * active     paid and renewing
 * grace      a renewal payment failed; Play retries during the grace period (access kept)
 * cancelled  auto-renew off; access until expiresAt
 * paused     a pause is scheduled or running; access until expiresAt
 * expired    ended (access gone)
 * refunded   refunded or revoked by Google (access gone at once)
 */
export type StoreState = 'active' | 'grace' | 'cancelled' | 'paused' | 'expired' | 'refunded';

export interface StoreSubscriptionState {
  provider: string;
  plan: StorePlanKey;
  period: StoreBillingPeriod;
  productId: string;
  state: StoreState;
  willRenew: boolean;
  expiresAt: Date | null;
  originalTransactionId: string | null;
  transactionId: string | null;
  environment: 'SANDBOX' | 'PRODUCTION';
  managementUrl: string | null;
  /** When the store reported this; an older state never overwrites a newer one. */
  observedAt: Date;
}

export const ACCESS_STATES: ReadonlySet<StoreState> = new Set([
  'active',
  'grace',
  'cancelled',
  'paused',
]);

/** Access while the state allows it and the expiry (if any) is still ahead. */
export function hasAccess(state: StoreSubscriptionState, now: Date = new Date()): boolean {
  if (!ACCESS_STATES.has(state.state)) return false;
  return !state.expiresAt || state.expiresAt.getTime() > now.getTime();
}

/**
 * RevenueCat sends a CANCELLATION with cancel_reason CUSTOMER_SUPPORT when a purchase is
 * refunded or revoked (Google refunds included): access ends at once.
 */
export const REFUND_CANCEL_REASONS: ReadonlySet<string> = new Set(['CUSTOMER_SUPPORT']);

export type EventPlan =
  | { kind: 'apply'; state: StoreSubscriptionState; refundedTransactionId?: string | null }
  /** Re-read the subscriber from RevenueCat (product change, transfer, refund reversed). */
  | { kind: 'resync' }
  | { kind: 'transfer'; from: string[]; to: string[] }
  | { kind: 'ignore'; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUserId = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);

/** Our user id among the ids RevenueCat knows this customer by (anonymous ids skipped). */
export function candidateUserIds(event: RevenueCatEvent): string[] {
  const ids = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
  return [...new Set(ids.filter(isUserId).map((id) => id.toLowerCase()))];
}

const msToDate = (ms: number | null | undefined): Date | null =>
  typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? new Date(ms) : null;

const isoToDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const environmentOf = (env: unknown): 'SANDBOX' | 'PRODUCTION' =>
  env === 'SANDBOX' ? 'SANDBOX' : 'PRODUCTION';

/**
 * Decides what one webhook event means. `now` is only a fallback for events without a
 * timestamp.
 */
export function planForEvent(event: RevenueCatEvent, now: Date = new Date()): EventPlan {
  const type = (event.type || '').toUpperCase();

  switch (type) {
    case 'TEST':
      return { kind: 'ignore', reason: 'test_event' };
    case 'TRANSFER':
      return {
        kind: 'transfer',
        from: (event.transferred_from ?? []).filter(isUserId),
        to: (event.transferred_to ?? []).filter(isUserId),
      };
    case 'PRODUCT_CHANGE':
    case 'REFUND_REVERSED':
      return { kind: 'resync' };
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'SUBSCRIPTION_EXTENDED':
    case 'CANCELLATION':
    case 'EXPIRATION':
    case 'BILLING_ISSUE':
    case 'SUBSCRIPTION_PAUSED':
      break;
    default:
      // NON_RENEWING_PURCHASE, TEMPORARY_ENTITLEMENT_GRANT, INVOICE_ISSUANCE, … are not
      // something we sell or act on.
      return { kind: 'ignore', reason: `unhandled_type:${type || 'none'}` };
  }

  const provider = STORE_PROVIDERS[event.store ?? ''];
  if (!provider) return { kind: 'ignore', reason: `unsupported_store:${event.store ?? 'none'}` };

  const product = resolveStoreProduct(event.product_id);
  if (!product) return { kind: 'ignore', reason: `unknown_product:${event.product_id ?? 'none'}` };

  const base = {
    provider,
    plan: product.plan,
    period: product.period,
    productId: event.product_id as string,
    expiresAt: msToDate(event.expiration_at_ms),
    originalTransactionId: event.original_transaction_id ?? null,
    transactionId: event.transaction_id ?? null,
    environment: environmentOf(event.environment),
    managementUrl: null,
    observedAt: msToDate(event.event_timestamp_ms) ?? msToDate(event.purchased_at_ms) ?? now,
  };

  switch (type) {
    case 'CANCELLATION':
      if (REFUND_CANCEL_REASONS.has((event.cancel_reason ?? '').toUpperCase())) {
        return {
          kind: 'apply',
          state: { ...base, state: 'refunded', willRenew: false },
          refundedTransactionId: event.transaction_id ?? null,
        };
      }
      // Auto-renew off (or billing gave up): access until the expiry, then EXPIRATION.
      return { kind: 'apply', state: { ...base, state: 'cancelled', willRenew: false } };
    case 'EXPIRATION':
      return { kind: 'apply', state: { ...base, state: 'expired', willRenew: false } };
    case 'BILLING_ISSUE': {
      // Grace period: keep access until it runs out; Play keeps retrying the payment.
      const graceEnds = msToDate(event.grace_period_expiration_at_ms);
      return {
        kind: 'apply',
        state: { ...base, state: 'grace', willRenew: true, expiresAt: graceEnds ?? base.expiresAt },
      };
    }
    case 'SUBSCRIPTION_PAUSED':
      // The pause starts at the end of the paid period; EXPIRATION follows then.
      return { kind: 'apply', state: { ...base, state: 'paused', willRenew: false } };
    default:
      // INITIAL_PURCHASE, RENEWAL, UNCANCELLATION, SUBSCRIPTION_EXTENDED
      return { kind: 'apply', state: { ...base, state: 'active', willRenew: true } };
  }
}

/**
 * The subscriber's best store subscription: one with access first, then the higher plan,
 * then the later expiry. Null when they have no subscription we sell.
 */
export function stateFromSubscriber(
  subscriber: RevenueCatSubscriber,
  options: { acceptSandbox: boolean; now?: Date },
): StoreSubscriptionState | null {
  const now = options.now ?? new Date();
  const candidates: StoreSubscriptionState[] = [];

  for (const [key, sub] of Object.entries(subscriber.subscriptions ?? {})) {
    const provider = STORE_PROVIDERS[sub.store ?? ''];
    if (!provider) continue;
    if (sub.is_sandbox && !options.acceptSandbox) continue;
    const product = resolveStoreProduct(key, sub.product_plan_identifier);
    if (!product) continue;

    const expiresAt = isoToDate(sub.expires_date);
    const graceEnds = isoToDate(sub.grace_period_expires_date);
    let state: StoreState;
    let effectiveExpiry = expiresAt;
    if (sub.refunded_at) {
      state = 'refunded';
    } else if (sub.billing_issues_detected_at && graceEnds && graceEnds > now) {
      state = 'grace';
      effectiveExpiry = graceEnds;
    } else if (expiresAt && expiresAt <= now) {
      state = 'expired';
    } else if (sub.auto_resume_date) {
      state = 'paused';
    } else if (sub.unsubscribe_detected_at) {
      state = 'cancelled';
    } else {
      state = 'active';
    }

    candidates.push({
      provider,
      plan: product.plan,
      period: product.period,
      productId: key.includes(':') ? key : `${key}:${product.period}`,
      state,
      willRenew: state === 'active' || state === 'grace',
      expiresAt: effectiveExpiry,
      originalTransactionId: null,
      transactionId: sub.store_transaction_id ?? null,
      environment: sub.is_sandbox ? 'SANDBOX' : 'PRODUCTION',
      managementUrl: subscriber.management_url ?? null,
      observedAt: now,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const access = Number(hasAccess(b, now)) - Number(hasAccess(a, now));
    if (access !== 0) return access;
    const rank = (PLAN_RANK[b.plan] ?? 0) - (PLAN_RANK[a.plan] ?? 0);
    if (rank !== 0) return rank;
    return (b.expiresAt?.getTime() ?? 0) - (a.expiresAt?.getTime() ?? 0);
  });
  return candidates[0];
}
