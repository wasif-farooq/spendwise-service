import {
  IPaymentGateway,
  PaymentCustomer,
  SubscriptionDetails,
  CheckoutSession,
} from '../interfaces/IPaymentGateway';
import { ConfigLoader } from '@config/ConfigLoader';
import { AppError } from '@shared/errors/AppError';

/**
 * Paddle Billing gateway (https://developer.paddle.com), talking to the REST API with
 * fetch — no SDK.
 *
 * Checkout model: we create a *transaction* server-side with a non-catalog recurring
 * price built from our own plan, and the web app opens it in the Paddle.js overlay by
 * transaction id. Non-catalog prices mean nothing has to be provisioned in the Paddle
 * catalog, and the price the customer pays is always the one in our database.
 *
 * Secrets: the API key only ever appears in the Authorization header of outgoing
 * requests. Error messages and logs carry Paddle's error code/detail, never headers.
 */

export type PaddleEnvironment = 'sandbox' | 'production';

export interface PaddleCustomData {
  userId?: string;
  planId?: string;
  billingPeriod?: 'monthly' | 'yearly';
  app?: string;
  [key: string]: unknown;
}

export interface PaddleTransaction {
  id: string;
  status: 'draft' | 'ready' | 'billed' | 'paid' | 'completed' | 'canceled' | 'past_due';
  customer_id: string | null;
  subscription_id: string | null;
  currency_code: string;
  custom_data: PaddleCustomData | null;
  billing_period?: { starts_at: string; ends_at: string } | null;
  details?: { totals?: { grand_total?: string; total?: string } } | null;
  checkout?: { url: string | null } | null;
}

export interface PaddleSubscription {
  id: string;
  status: 'active' | 'canceled' | 'past_due' | 'paused' | 'trialing';
  customer_id: string;
  custom_data: PaddleCustomData | null;
  current_billing_period?: { starts_at: string; ends_at: string } | null;
  next_billed_at?: string | null;
  scheduled_change?: { action: 'cancel' | 'pause' | 'resume'; effective_at: string } | null;
}

interface PaddleErrorBody {
  error?: { type?: string; code?: string; detail?: string };
}

/** App tag written into custom_data so a shared Paddle account's other products are ignored. */
export const PADDLE_APP_TAG = 'spendwise';

const BASE_URLS: Record<PaddleEnvironment, string> = {
  sandbox: 'https://sandbox-api.paddle.com',
  production: 'https://api.paddle.com',
};

export function mapPaddleSubscriptionStatus(
  status: PaddleSubscription['status'],
): SubscriptionDetails['status'] {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
    case 'paused':
      return 'past_due';
    case 'canceled':
    default:
      return 'cancelled';
  }
}

/** Minor units as Paddle wants them: an integer string ("999" for 9.99). */
export function toMinorUnits(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('Plan price must be a positive amount', 400);
  }
  return String(Math.round(amount * 100));
}

export class PaddleGateway implements IPaymentGateway {
  private readonly apiKey: string;
  private readonly clientToken: string;
  readonly environment: PaddleEnvironment;
  private readonly baseUrl: string;

  constructor() {
    const config = ConfigLoader.getInstance();
    this.apiKey = config.get('paddle.apiKey') || '';
    this.clientToken = config.get('paddle.clientToken') || '';
    this.environment = config.get('paddle.environment') === 'production' ? 'production' : 'sandbox';
    this.baseUrl = BASE_URLS[this.environment];

    if (!this.apiKey) {
      throw new Error('PADDLE_API_KEY is not configured');
    }
  }

  getProviderName(): string {
    return 'paddle';
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new AppError(`Paddle is unreachable: ${(err as Error).message}`, 502);
    }

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      const err = (parsed as PaddleErrorBody | null)?.error;
      const detail = err?.detail || response.statusText || 'unknown error';
      const code = err?.code ? ` (${err.code})` : '';
      const message = `Paddle API error${code}: ${detail}`;
      const e = new AppError(message, PaddleGateway.mapStatus(response.status));
      (e as AppError & { paddleCode?: string }).paddleCode = err?.code;
      throw e;
    }

    return ((parsed as { data?: T } | null)?.data ?? (parsed as T)) as T;
  }

  /**
   * Paddle's status → ours. Auth failures are OUR misconfiguration, not the caller's, so
   * they surface as 502 rather than leaking a 401 that the web app would read as
   * "your session expired".
   */
  private static mapStatus(status: number): number {
    if (status === 404) return 404;
    if (status === 400 || status === 409 || status === 422) return 400;
    if (status === 429) return 429;
    return 502;
  }

  /** Finds an active customer by email, or creates one. */
  async findOrCreateCustomer(customer: PaymentCustomer): Promise<string> {
    if (customer.id) return customer.id;

    const email = customer.email.trim().toLowerCase();
    const existing = await this.request<Array<{ id: string }>>(
      'GET',
      `/customers?email=${encodeURIComponent(email)}`,
    );
    if (Array.isArray(existing) && existing[0]?.id) return existing[0].id;

    try {
      const created = await this.request<{ id: string }>('POST', '/customers', {
        email,
        name: customer.name || undefined,
      });
      return created.id;
    } catch (err) {
      // An archived customer is invisible to the list call but still owns the email.
      // Paddle names its id in the conflict detail.
      const code = (err as { paddleCode?: string }).paddleCode;
      const match = /ctm_[a-z0-9]+/i.exec((err as Error).message);
      if (code === 'customer_already_exists' && match) return match[0];
      throw err;
    }
  }

  async createCheckoutSession(params: {
    planId: string;
    planPrice: number;
    planName: string;
    billingPeriod: 'monthly' | 'yearly';
    customer: PaymentCustomer;
    successUrl: string;
    cancelUrl: string;
    userId?: string;
    currency?: string;
  }): Promise<CheckoutSession> {
    const { planId, planPrice, planName, billingPeriod, customer, userId } = params;
    const currency = (params.currency || 'USD').toUpperCase();

    if (!userId) {
      throw new AppError('Paddle checkout requires a user', 400);
    }
    if (!this.clientToken) {
      // Without it the browser cannot open the overlay; fail before creating a
      // transaction the customer can never pay.
      throw new AppError('Paddle checkout is not configured (missing client token)', 503);
    }

    const customerId = await this.findOrCreateCustomer(customer);

    // Names already branded (either the current or the legacy SpendWise prefix) are kept as-is.
    const productName = /^(trackmypocket|spendwise)\b/i.test(planName)
      ? planName
      : `TrackMyPocket ${planName}`;
    const customData: PaddleCustomData = { userId, planId, billingPeriod, app: PADDLE_APP_TAG };

    const transaction = await this.request<PaddleTransaction>('POST', '/transactions', {
      customer_id: customerId,
      currency_code: currency,
      collection_mode: 'automatic',
      custom_data: customData,
      items: [
        {
          quantity: 1,
          price: {
            description: `${productName} ${billingPeriod}`,
            name: `${productName} (${billingPeriod === 'yearly' ? 'yearly' : 'monthly'})`,
            unit_price: { amount: toMinorUnits(planPrice), currency_code: currency },
            billing_cycle: {
              interval: billingPeriod === 'yearly' ? 'year' : 'month',
              frequency: 1,
            },
            tax_mode: 'account_setting',
            // One seat per subscription: hides the overlay's quantity picker.
            quantity: { minimum: 1, maximum: 1 },
            product: { name: productName, tax_category: 'standard' },
          },
        },
      ],
    });

    return {
      // Paddle's hosted checkout URL is the account's *default payment link*, which is not
      // guaranteed to be ours. The web app opens the overlay by transaction id instead.
      url: '',
      sessionId: transaction.id,
      provider: 'paddle',
      transactionId: transaction.id,
      clientToken: this.clientToken,
      environment: this.environment,
    };
  }

  async getTransaction(transactionId: string): Promise<PaddleTransaction> {
    return this.request<PaddleTransaction>(
      'GET',
      `/transactions/${encodeURIComponent(transactionId)}`,
    );
  }

  async getSubscription(subscriptionId: string): Promise<PaddleSubscription> {
    return this.request<PaddleSubscription>(
      'GET',
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
  }

  async getSubscriptionDetails(subscriptionId: string): Promise<SubscriptionDetails> {
    const sub = await this.getSubscription(subscriptionId);
    const periodEnd = sub.current_billing_period?.ends_at || sub.next_billed_at || undefined;
    return {
      id: sub.id,
      status: mapPaddleSubscriptionStatus(sub.status),
      planId: typeof sub.custom_data?.planId === 'string' ? sub.custom_data.planId : '',
      currentPeriodEnd: periodEnd ? new Date(periodEnd) : undefined,
      cancelAtPeriodEnd: sub.scheduled_change?.action === 'cancel',
    };
  }

  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd: boolean = true,
  ): Promise<void> {
    await this.request('POST', `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
      effective_from: cancelAtPeriodEnd ? 'next_billing_period' : 'immediately',
    });
  }
}
