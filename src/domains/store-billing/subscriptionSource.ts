import { AppError } from '@shared/errors/AppError';
import {
  GOOGLE_PLAY_PROVIDER,
  GOOGLE_PLAY_SUBSCRIPTIONS_URL,
  planKeyOfName,
} from './storeProducts';

/**
 * Who bills the user's paid plan, and the rule that keeps it to one biller (P15).
 *
 * Rule: a user has at most one live paid subscription. Whichever biller holds the live
 * one "manages" the plan:
 *  - while Google Play manages it, the web (Paddle) checkout, plan changes and cancel
 *    answer 409 SUBSCRIPTION_MANAGED_BY_GOOGLE_PLAY (the user changes or cancels it in
 *    Google Play);
 *  - while Paddle manages it, the app doesn't offer a Play purchase (it shows "Managed on
 *    the web"). If a Play purchase arrives anyway (a race, or a second device), it is
 *    recorded in the store_* columns with store_state 'conflict' but does not replace the
 *    Paddle plan, and POST /subscription/sync answers 409 SUBSCRIPTION_MANAGED_BY_PADDLE so
 *    the app can tell the user to cancel one of them (and ask Google for a refund).
 */
export type SubscriptionSource = 'paddle' | 'google_play';

export const STORE_BILLING_ERRORS = {
  SUBSCRIPTION_MANAGED_BY_GOOGLE_PLAY: 'SUBSCRIPTION_MANAGED_BY_GOOGLE_PLAY',
  SUBSCRIPTION_MANAGED_BY_PADDLE: 'SUBSCRIPTION_MANAGED_BY_PADDLE',
  STORE_BILLING_UNAVAILABLE: 'STORE_BILLING_UNAVAILABLE',
  STORE_SYNC_FAILED: 'STORE_SYNC_FAILED',
  TOO_MANY_SYNCS: 'TOO_MANY_SYNCS',
} as const;

export type StoreBillingErrorCode =
  (typeof STORE_BILLING_ERRORS)[keyof typeof STORE_BILLING_ERRORS];

export class StoreBillingError extends AppError {
  constructor(
    message: string,
    statusCode: number,
    public readonly code: StoreBillingErrorCode,
  ) {
    super(message, statusCode);
  }
}

export const MANAGED_BY_GOOGLE_PLAY_MESSAGE =
  'Your subscription is billed through Google Play. Change or cancel it in Google Play ' +
  '(Play Store › Payments & subscriptions › Subscriptions).';

export const MANAGED_BY_PADDLE_MESSAGE =
  'You already have a subscription billed on the TrackMyPocket website. Your Google Play ' +
  'purchase was not applied: cancel one of them (and ask Google Play for a refund if needed).';

const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

/** The parts of a subscription row (entity or SQL row) this needs. */
export interface SourceInput {
  status?: string | null;
  paymentProvider?: string | null;
  /** 'free' | 'starter' | … or a catalogue name ("Pro Monthly"). */
  planKey?: string | null;
}

/** 'paddle' / 'google_play' while that biller holds a live paid plan; otherwise null. */
export function subscriptionSourceOf(
  sub: SourceInput | null | undefined,
): SubscriptionSource | null {
  if (!sub) return null;
  if (!LIVE_STATUSES.has((sub.status ?? '').toLowerCase())) return null;
  if (planKeyOfName(sub.planKey) === 'free') return null;
  if (sub.paymentProvider === 'paddle') return 'paddle';
  if (sub.paymentProvider === GOOGLE_PLAY_PROVIDER) return 'google_play';
  return null;
}

export interface SubscriptionBillingFields {
  source: SubscriptionSource | null;
  /** Where the user manages the subscription; set for store subscriptions only. */
  managementUrl: string | null;
  willRenew: boolean | null;
  expiresAt: string | null;
  billingPeriod: 'monthly' | 'yearly' | null;
}

export interface BillingFieldsInput extends SourceInput {
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodEnd?: Date | string | null;
  billingCycle?: string | null;
  storeManagementUrl?: string | null;
}

/** The fields GET /subscription/current adds for P15. */
export function billingFieldsOf(
  sub: BillingFieldsInput | null | undefined,
): SubscriptionBillingFields {
  const source = subscriptionSourceOf(sub);
  if (!sub || !source) {
    return {
      source: null,
      managementUrl: null,
      willRenew: null,
      expiresAt: null,
      billingPeriod: null,
    };
  }
  const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const period =
    sub.billingCycle === 'monthly' || sub.billingCycle === 'yearly' ? sub.billingCycle : null;
  return {
    source,
    managementUrl:
      source === 'google_play' ? sub.storeManagementUrl || GOOGLE_PLAY_SUBSCRIPTIONS_URL : null,
    willRenew: !sub.cancelAtPeriodEnd,
    expiresAt: end && !Number.isNaN(end.getTime()) ? end.toISOString() : null,
    billingPeriod: period,
  };
}

/** Throws the 409 when Google Play manages the plan (web checkout, change plan, cancel). */
export function assertNotManagedByGooglePlay(sub: SourceInput | null | undefined): void {
  if (subscriptionSourceOf(sub) === 'google_play') {
    throw new StoreBillingError(
      MANAGED_BY_GOOGLE_PLAY_MESSAGE,
      409,
      STORE_BILLING_ERRORS.SUBSCRIPTION_MANAGED_BY_GOOGLE_PLAY,
    );
  }
}

/** `{ message, code }` for a StoreBillingError, else null. */
export function storeBillingErrorBody(error: unknown): { message: string; code: string } | null {
  return error instanceof StoreBillingError ? { message: error.message, code: error.code } : null;
}
