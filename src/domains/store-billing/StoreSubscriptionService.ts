import { RevenueCatClient } from './RevenueCatClient';
import {
  StoreBillingRepository,
  SubscriptionRow,
  SubscriptionWrite,
} from './StoreSubscriptionRepository';
import {
  RevenueCatEvent,
  StoreSubscriptionState,
  candidateUserIds,
  hasAccess,
  planForEvent,
  stateFromSubscriber,
} from './storeState';
import {
  MANAGED_BY_PADDLE_MESSAGE,
  STORE_BILLING_ERRORS,
  StoreBillingError,
  subscriptionSourceOf,
} from './subscriptionSource';

/** What applying a store state did to the user's subscription row. */
export type ApplyOutcome =
  | 'applied' // the store subscription is now the user's plan (or ended it)
  | 'stale' // an older state than the one already applied; skipped
  | 'conflict' // Paddle manages the plan; the Play purchase was recorded, not applied
  | 'recorded'; // store facts updated without touching the plan

export type WebhookOutcome =
  | ApplyOutcome
  | 'duplicate'
  | 'ignored_sandbox'
  | 'unknown_user'
  | 'resynced'
  | 'transferred'
  | `ignored:${string}`;

export interface SyncResult {
  outcome: ApplyOutcome | 'none';
  conflict: boolean;
}

export interface StoreSubscriptionServiceDeps {
  repository: StoreBillingRepository;
  /** Null when REVENUECAT_SECRET_API_KEY isn't set. */
  client: Pick<RevenueCatClient, 'getSubscriber'> | null;
  acceptSandbox: boolean;
  now?: () => Date;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

const PURCHASE_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL']);

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Google Play subscriptions (through RevenueCat) → user_subscriptions.
 *
 * The webhook and POST /subscription/sync both end in `applyState`, under a row lock, so a
 * sync racing a webhook can't interleave. The newest store observation wins
 * (`store_last_event_at`), and the one-biller rule in subscriptionSource.ts decides what
 * happens when Paddle already bills the user.
 */
export class StoreSubscriptionService {
  private readonly now: () => Date;
  private readonly log: Pick<Console, 'info' | 'warn' | 'error'>;

  constructor(private readonly deps: StoreSubscriptionServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.log = deps.logger ?? console;
  }

  /** Applies one authenticated webhook event exactly once (by event id). */
  async handleWebhookEvent(event: RevenueCatEvent): Promise<WebhookOutcome> {
    const repo = this.deps.repository;
    const claimed = await repo.claimEvent({
      id: event.id,
      type: event.type,
      appUserId: event.app_user_id ?? null,
      environment: event.environment ?? null,
    });
    if (!claimed) return 'duplicate';

    try {
      const outcome = await this.processEvent(event);
      await repo.finishEvent(event.id, outcome);
      return outcome;
    } catch (error) {
      // Let RevenueCat retry: forget the id so the retry is processed.
      await repo.releaseEvent(event.id).catch(() => undefined);
      throw error;
    }
  }

  private async processEvent(event: RevenueCatEvent): Promise<WebhookOutcome> {
    if (event.environment === 'SANDBOX' && !this.deps.acceptSandbox) return 'ignored_sandbox';

    const plan = planForEvent(event, this.now());
    if (plan.kind === 'ignore') return `ignored:${plan.reason}`;

    if (plan.kind === 'transfer') return this.applyTransfer(plan.from, plan.to);

    const userId = await this.resolveUser(event);
    if (!userId) {
      // 200 so RevenueCat doesn't retry: an anonymous id or a deleted account won't
      // become known by retrying.
      this.log.warn(
        `[RevenueCat] ${event.type} ${event.id}: no TrackMyPocket user for app_user_id ${event.app_user_id ?? '-'}`,
      );
      return 'unknown_user';
    }

    if (plan.kind === 'resync') {
      if (this.deps.client) {
        await this.syncUser(userId);
        return 'resynced';
      }
      if ((event.type || '').toUpperCase() === 'PRODUCT_CHANGE' && event.new_product_id) {
        // No API key: Google applies upgrades at once and RevenueCat names the new product.
        const fallback = planForEvent(
          { ...event, type: 'RENEWAL', product_id: event.new_product_id },
          this.now(),
        );
        if (fallback.kind === 'apply') return this.applyState(userId, fallback.state);
      }
      this.log.warn(
        `[RevenueCat] ${event.type} ${event.id}: needs REVENUECAT_SECRET_API_KEY to re-read the subscriber; skipped`,
      );
      return `ignored:no_api_key`;
    }

    const outcome = await this.applyState(userId, plan.state);

    const type = (event.type || '').toUpperCase();
    if (plan.refundedTransactionId) {
      await this.deps.repository.markPaymentRefunded(
        plan.state.provider,
        plan.refundedTransactionId,
      );
    } else if (PURCHASE_EVENTS.has(type) && event.transaction_id) {
      await this.recordPayment(userId, event, plan.state);
    }
    return outcome;
  }

  private async resolveUser(event: RevenueCatEvent): Promise<string | null> {
    for (const id of candidateUserIds(event)) {
      if (await this.deps.repository.userExists(id)) return id;
    }
    return null;
  }

  /**
   * Purchases moved between RevenueCat customers (a restore on another account). The
   * accounts they left lose the store plan; the accounts they joined are re-read.
   */
  private async applyTransfer(from: string[], to: string[]): Promise<WebhookOutcome> {
    const repo = this.deps.repository;
    for (const userId of from) {
      if (!(await repo.userExists(userId))) continue;
      await repo.transaction(async (trx) => {
        const row = await trx.findCurrent(userId);
        if (row && subscriptionSourceOf(row) === 'google_play') {
          await this.endStorePlan(trx, row, 'expired', this.now());
        }
      });
    }
    for (const userId of to) {
      if (!(await repo.userExists(userId))) continue;
      if (this.deps.client) await this.syncUser(userId);
      else
        this.log.warn(
          `[RevenueCat] TRANSFER to ${userId}: needs REVENUECAT_SECRET_API_KEY to read the moved purchase`,
        );
    }
    return 'transferred';
  }

  /**
   * POST /subscription/sync: read the subscriber from RevenueCat and apply it, so the app
   * shows the new plan right after a purchase without waiting for the webhook.
   */
  async syncUser(userId: string): Promise<SyncResult> {
    const client = this.deps.client;
    if (!client) {
      throw new StoreBillingError(
        'In-app purchases are not available right now.',
        503,
        STORE_BILLING_ERRORS.STORE_BILLING_UNAVAILABLE,
      );
    }

    let subscriber;
    try {
      subscriber = await client.getSubscriber(userId);
    } catch (error) {
      this.log.error(`[RevenueCat] sync for ${userId} failed: ${(error as Error).message}`);
      throw new StoreBillingError(
        "We couldn't check your Google Play purchase. Please try again in a moment.",
        502,
        STORE_BILLING_ERRORS.STORE_SYNC_FAILED,
      );
    }

    const state = stateFromSubscriber(subscriber, {
      acceptSandbox: this.deps.acceptSandbox,
      now: this.now(),
    });
    if (!state) return { outcome: 'none', conflict: false };

    const outcome = await this.applyState(userId, state);
    return { outcome, conflict: outcome === 'conflict' };
  }

  /** Throws the 409 when a sync found a Play purchase that Paddle's plan blocks. */
  async syncOrConflict(userId: string): Promise<SyncResult> {
    const result = await this.syncUser(userId);
    if (result.conflict) {
      throw new StoreBillingError(
        MANAGED_BY_PADDLE_MESSAGE,
        409,
        STORE_BILLING_ERRORS.SUBSCRIPTION_MANAGED_BY_PADDLE,
      );
    }
    return result;
  }

  /** Writes a store state into the user's subscription row, under a row lock. */
  async applyState(userId: string, state: StoreSubscriptionState): Promise<ApplyOutcome> {
    const now = this.now();
    return this.deps.repository.transaction(async (repo) => {
      const row = await repo.findCurrent(userId);

      if (row?.storeLastEventAt && state.observedAt < row.storeLastEventAt) {
        this.log.info(
          `[RevenueCat] ${userId}: ${state.state} from ${state.observedAt.toISOString()} is older than the stored state; skipped`,
        );
        return 'stale';
      }

      const storeFacts: SubscriptionWrite = {
        storeProductId: state.productId,
        storeEnvironment: state.environment,
        storeState: state.state,
        storeLastEventAt: state.observedAt,
        ...(state.originalTransactionId && {
          storeOriginalTransactionId: state.originalTransactionId,
        }),
        ...(state.managementUrl && { storeManagementUrl: state.managementUrl }),
      };

      const access = hasAccess(state, now);
      const source = subscriptionSourceOf(row);

      // One biller per user: Paddle's live plan wins over a Play purchase.
      if (source === 'paddle' && row) {
        await repo.updateSubscription(row.id, {
          ...storeFacts,
          storeState: access ? 'conflict' : state.state,
        });
        if (access) {
          this.log.warn(
            `[RevenueCat] ${userId}: Google Play ${state.productId} while Paddle bills the plan; recorded as conflict`,
          );
          return 'conflict';
        }
        return 'recorded';
      }

      if (!access) {
        // Expired / refunded. Only end the plan if Play was the one providing it.
        if (row && (source === 'google_play' || row.paymentProvider === state.provider)) {
          await this.endStorePlan(repo, row, state.state, now, storeFacts);
          return 'applied';
        }
        if (row) await repo.updateSubscription(row.id, storeFacts);
        return 'recorded';
      }

      const plan = await repo.findPlanByKey(state.plan);
      if (!plan) {
        throw new Error(`Plan "${state.plan}" is missing from subscription_plans`);
      }

      const write: SubscriptionWrite = {
        ...storeFacts,
        planId: plan.id,
        status: state.state === 'grace' ? 'past_due' : 'active',
        paymentProvider: state.provider,
        merchantSubscriptionId:
          state.originalTransactionId ??
          (row?.paymentProvider === state.provider ? row.merchantSubscriptionId : null),
        billingCycle: state.period,
        currentPeriodEnd: state.expiresAt,
        cancelAtPeriodEnd: !state.willRenew,
        cancelledAt: state.willRenew ? null : now,
        featuresSnapshot: plan.features ?? [],
        limitsSnapshot: plan.limits ?? {},
      };
      if (!state.willRenew && row?.cancelAtPeriodEnd && row.paymentProvider === state.provider) {
        // Keep the first cancellation time.
        delete write.cancelledAt;
      }

      if (row) await repo.updateSubscription(row.id, write);
      else await repo.createSubscription(userId, write);
      return 'applied';
    });
  }

  /** Back to the Free plan; the store facts stay for support and late events. */
  private async endStorePlan(
    repo: StoreBillingRepository,
    row: SubscriptionRow,
    storeState: string,
    now: Date,
    extra: SubscriptionWrite = {},
  ): Promise<void> {
    const free = await repo.findPlanByKey('free');
    await repo.updateSubscription(row.id, {
      ...extra,
      ...(free && {
        planId: free.id,
        featuresSnapshot: free.features ?? [],
        limitsSnapshot: free.limits ?? {},
      }),
      status: 'active',
      paymentProvider: null,
      merchantSubscriptionId: null,
      billingCycle: 'monthly',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      cancelledAt: now,
      storeState,
      storeLastEventAt: extra.storeLastEventAt ?? now,
    });
  }

  private async recordPayment(
    userId: string,
    event: RevenueCatEvent,
    state: StoreSubscriptionState,
  ): Promise<void> {
    const row = await this.deps.repository.findCurrent(userId);
    if (!row) return;
    const local = event.price_in_purchased_currency ?? event.price ?? 0;
    const currency = (
      event.price_in_purchased_currency != null && event.currency ? event.currency : 'USD'
    ).toUpperCase();
    await this.deps.repository.recordPayment({
      userId,
      subscriptionId: row.id,
      provider: state.provider,
      transactionId: event.transaction_id as string,
      amount: Math.max(0, Math.round(Number(local) * 100)) || 0,
      currency,
      description: `Google Play: ${titleCase(state.plan)} (${state.period})`,
      metadata: {
        store: event.store,
        productId: state.productId,
        originalTransactionId: event.original_transaction_id ?? null,
        environment: state.environment,
        eventType: event.type,
      },
    });
  }
}
