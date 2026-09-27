import { DatabaseFacade } from '@facades/DatabaseFacade';
import { AppError } from '@shared/errors/AppError';
import {
  SubscriptionPlanRepository,
  UserSubscriptionRepository,
} from '@domains/subscription/repositories/SubscriptionRepository';
import { UserSubscription } from '@domains/subscription/models/UserSubscription';

export interface ActivatePaidSubscriptionParams {
  userId: string;
  planId: string;
  provider: string;
  /**
   * The provider's subscription id. `undefined` leaves the stored value untouched — Paddle
   * can report a paid transaction a moment before it has created the subscription.
   */
  merchantSubscriptionId?: string | null;
  billingPeriod?: 'monthly' | 'yearly';
  currentPeriodEnd?: Date;
}

export interface ActivationResult {
  subscription: UserSubscription;
  /** false when the subscription already matched and nothing was written. */
  changed: boolean;
}

export interface ProviderPaymentRecord {
  userId: string;
  subscriptionId: string;
  provider: string;
  /** The provider's id for this charge (e.g. Paddle txn_…). Unique per provider. */
  providerPaymentId: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'refunded' | 'pending';
  type?: string;
  invoiceUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Turns a confirmed payment into an active paid subscription.
 *
 * Shared by every path that learns "this user paid for plan X": the Stripe
 * checkout.session.completed webhook, the Paddle confirm endpoint and the Paddle
 * transaction webhook. Keeping one implementation means a Paddle purchase and a Stripe
 * purchase leave the subscription row in the same shape — in particular, both snapshot
 * the new plan's features and limits, which is what limit checks read.
 *
 * Idempotent: activating the same plan with the same merchant subscription id twice is a
 * no-op, so a confirm call racing the webhook is harmless.
 */
export class SubscriptionActivationService {
  private readonly subRepo: UserSubscriptionRepository;
  private readonly planRepo: SubscriptionPlanRepository;

  constructor(private readonly db: DatabaseFacade) {
    this.subRepo = new UserSubscriptionRepository(db);
    this.planRepo = new SubscriptionPlanRepository(db);
  }

  async activatePaidSubscription(
    params: ActivatePaidSubscriptionParams,
  ): Promise<ActivationResult> {
    const { userId, planId, provider, merchantSubscriptionId, billingPeriod, currentPeriodEnd } =
      params;

    const plan = await this.planRepo.findById(planId);
    if (!plan) {
      throw new AppError(`Plan ${planId} not found`, 404);
    }

    const existing = await this.subRepo.findByUserId(userId);

    const update: Record<string, unknown> = {
      planId,
      status: 'active',
      paymentProvider: provider,
      featuresSnapshot: [...(plan.features || [])],
      limitsSnapshot: { ...(plan.limits || {}) },
      cancelAtPeriodEnd: false,
    };
    if (merchantSubscriptionId !== undefined)
      update.merchantSubscriptionId = merchantSubscriptionId;
    if (billingPeriod) update.billingCycle = billingPeriod;
    if (currentPeriodEnd) update.currentPeriodEnd = currentPeriodEnd;

    if (existing) {
      const alreadyActive =
        existing.planId === planId &&
        existing.status === 'active' &&
        existing.paymentProvider === provider &&
        (merchantSubscriptionId === undefined ||
          existing.merchantSubscriptionId === merchantSubscriptionId);
      if (alreadyActive) {
        return { subscription: existing, changed: false };
      }

      await this.subRepo.update(existing.id, update);
      console.log(`[SubscriptionActivation] ${provider}: user ${userId} → plan ${planId}`);
      return { subscription: await this.reload(existing.id), changed: true };
    }

    // BaseRepository.create/update return raw snake_case rows; reload for the entity.
    const created = await this.subRepo.create({
      userId,
      startDate: new Date(),
      ...update,
    });
    console.log(`[SubscriptionActivation] ${provider}: created subscription for user ${userId}`);
    return { subscription: await this.reload((created as { id: string }).id), changed: true };
  }

  private async reload(id: string): Promise<UserSubscription> {
    const sub = await this.subRepo.findById(id);
    if (!sub) throw new AppError('Subscription disappeared while activating', 500);
    return sub;
  }

  /**
   * Records a provider charge once. Keyed on (provider, provider_payment_id), so replays of
   * the same webhook or repeated confirm calls update the row instead of duplicating it.
   */
  async recordProviderPayment(data: ProviderPaymentRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO payments (
          user_id, subscription_id, provider, provider_payment_id,
          amount, currency, status, type, invoice_url, metadata, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       ON CONFLICT (provider, provider_payment_id) DO UPDATE SET
          status = EXCLUDED.status,
          invoice_url = COALESCE(EXCLUDED.invoice_url, payments.invoice_url),
          updated_at = NOW()`,
      [
        data.userId,
        data.subscriptionId,
        data.provider,
        data.providerPaymentId,
        data.amount,
        data.currency,
        data.status,
        data.type || 'payment',
        data.invoiceUrl ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ],
    );
  }
}
