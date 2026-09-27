import { AppError } from '@shared/errors/AppError';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { UserSubscriptionRepository } from '@domains/subscription/repositories/SubscriptionRepository';
import {
  PADDLE_APP_TAG,
  PaddleCustomData,
  PaddleGateway,
  PaddleSubscription,
  PaddleTransaction,
  mapPaddleSubscriptionStatus,
} from './PaddleGateway';
import { SubscriptionActivationService } from './SubscriptionActivationService';

/** Transaction statuses that mean the money has been collected. */
const SETTLED_STATUSES: ReadonlyArray<PaddleTransaction['status']> = ['paid', 'completed'];

const TRANSACTION_ID = /^txn_[a-z0-9]{10,64}$/i;

export type PaddleConfirmResult =
  | {
      status: 'active';
      transactionId: string;
      transactionStatus: PaddleTransaction['status'];
      /** true when this call changed the plan; false when it was already applied. */
      activated: boolean;
      subscription: {
        id: string;
        planId: string;
        status: string;
        paymentProvider?: string;
        merchantSubscriptionId?: string;
        billingPeriod?: string;
      };
    }
  | {
      status: 'pending';
      transactionId: string;
      transactionStatus: PaddleTransaction['status'];
    };

export interface PaddleWebhookEvent {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: Record<string, unknown>;
}

function isSpendwise(custom: PaddleCustomData | null | undefined): custom is PaddleCustomData {
  return !!custom && custom.app === PADDLE_APP_TAG;
}

function billingPeriodOf(custom: PaddleCustomData): 'monthly' | 'yearly' | undefined {
  return custom.billingPeriod === 'monthly' || custom.billingPeriod === 'yearly'
    ? custom.billingPeriod
    : undefined;
}

/**
 * Paddle-specific billing flows: confirming a checkout from the browser, and applying
 * webhook events. Both converge on SubscriptionActivationService, the same code the Stripe
 * webhook uses.
 *
 * The confirm path exists because webhooks can't be relied on everywhere (local dev, a
 * shared sandbox account whose notification destination points elsewhere). It is safe to
 * expose because it trusts nothing from the browser except a transaction id: status,
 * owner and plan are read back from Paddle with our API key.
 */
export class PaddleBillingService {
  constructor(
    private readonly gateway: PaddleGateway,
    private readonly db: DatabaseFacade,
    private readonly activation: SubscriptionActivationService = new SubscriptionActivationService(
      db,
    ),
  ) {}

  async confirmTransaction(userId: string, transactionId: string): Promise<PaddleConfirmResult> {
    if (typeof transactionId !== 'string' || !TRANSACTION_ID.test(transactionId)) {
      throw new AppError('A valid Paddle transactionId is required', 400);
    }

    const txn = await this.gateway.getTransaction(transactionId);
    const custom = txn.custom_data;

    // Same response for "someone else's" and "another product's" transaction, so the
    // endpoint can't be used to probe which ids exist.
    if (!isSpendwise(custom) || custom.userId !== userId) {
      throw new AppError('This transaction does not belong to your account', 403);
    }

    if (!SETTLED_STATUSES.includes(txn.status)) {
      return { status: 'pending', transactionId: txn.id, transactionStatus: txn.status };
    }

    const { subscription, changed } = await this.applySettledTransaction(txn, custom);

    return {
      status: 'active',
      transactionId: txn.id,
      transactionStatus: txn.status,
      activated: changed,
      subscription: {
        id: subscription.id,
        planId: subscription.planId,
        status: subscription.status,
        paymentProvider: subscription.paymentProvider,
        merchantSubscriptionId: subscription.merchantSubscriptionId,
        billingPeriod: billingPeriodOf(custom),
      },
    };
  }

  private async applySettledTransaction(txn: PaddleTransaction, custom: PaddleCustomData) {
    const userId = custom.userId;
    const planId = custom.planId;
    if (typeof userId !== 'string' || typeof planId !== 'string') {
      throw new AppError('Paddle transaction is missing SpendWise metadata', 422);
    }

    const result = await this.activation.activatePaidSubscription({
      userId,
      planId,
      provider: 'paddle',
      // A 'paid' transaction may not have its subscription yet; leave the stored id alone
      // and let 'completed' (or subscription.created) fill it in.
      merchantSubscriptionId: txn.subscription_id ?? undefined,
      billingPeriod: billingPeriodOf(custom),
      currentPeriodEnd: txn.billing_period?.ends_at
        ? new Date(txn.billing_period.ends_at)
        : undefined,
    });

    const totals = txn.details?.totals;
    const amount = parseInt(totals?.grand_total ?? totals?.total ?? '0', 10);
    await this.activation.recordProviderPayment({
      userId,
      subscriptionId: result.subscription.id,
      provider: 'paddle',
      providerPaymentId: txn.id,
      amount: Number.isFinite(amount) ? amount : 0,
      currency: (txn.currency_code || 'USD').toUpperCase(),
      status: 'succeeded',
      metadata: { paddleSubscriptionId: txn.subscription_id, paddleCustomerId: txn.customer_id },
    });

    return result;
  }

  /** Applies one verified webhook event. Unknown and foreign events are ignored. */
  async handleEvent(event: PaddleWebhookEvent): Promise<'applied' | 'ignored'> {
    const type = event.event_type || '';
    const data = event.data || {};

    switch (type) {
      case 'transaction.completed':
      case 'transaction.paid': {
        const txn = data as unknown as PaddleTransaction;
        if (!isSpendwise(txn.custom_data) || !SETTLED_STATUSES.includes(txn.status)) {
          return 'ignored';
        }
        await this.applySettledTransaction(txn, txn.custom_data);
        return 'applied';
      }
      case 'subscription.created':
      case 'subscription.activated':
      case 'subscription.updated':
      case 'subscription.canceled':
      case 'subscription.past_due':
      case 'subscription.paused':
      case 'subscription.resumed':
        return this.applySubscriptionEvent(type, data as unknown as PaddleSubscription);
      default:
        return 'ignored';
    }
  }

  private async applySubscriptionEvent(
    type: string,
    sub: PaddleSubscription,
  ): Promise<'applied' | 'ignored'> {
    // Only our own subscriptions. Paddle copies the checkout transaction's custom_data
    // onto the subscription, so the app tag is present on everything we created.
    if (!isSpendwise(sub.custom_data) || !sub.id) return 'ignored';

    const subRepo = new UserSubscriptionRepository(this.db);
    let existing = await subRepo.findByMerchantSubscriptionId(sub.id);

    // First sighting of this subscription id (e.g. subscription.created before the
    // transaction completed): attach it to the user's Paddle subscription row.
    if (!existing && typeof sub.custom_data.userId === 'string') {
      const byUser = await subRepo.findByUserId(sub.custom_data.userId);
      if (byUser && byUser.paymentProvider === 'paddle' && !byUser.merchantSubscriptionId) {
        await subRepo.update(byUser.id, { merchantSubscriptionId: sub.id });
        existing = byUser;
      }
    }
    if (!existing) return 'ignored';

    const status =
      type === 'subscription.canceled' ? 'cancelled' : mapPaddleSubscriptionStatus(sub.status);
    const periodEnd = sub.current_billing_period?.ends_at;
    await subRepo.updateStatusAndPeriod(
      existing.id,
      status,
      periodEnd ? new Date(periodEnd) : undefined,
      sub.scheduled_change?.action === 'cancel',
    );
    return 'applied';
  }
}
