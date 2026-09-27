export interface PaymentCustomer {
  id?: string;
  email: string;
  name?: string;
}

export interface SubscriptionDetails {
  id: string;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  planId: string;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
}

export interface CheckoutSession {
  /** Hosted checkout URL to redirect to. Empty for overlay-only providers (Paddle). */
  url: string;
  sessionId: string;
  /** Set by providers whose checkout is opened client-side (Paddle.js overlay). */
  provider?: PaymentProvider;
  transactionId?: string;
  /** Browser-safe client-side token. Never an API key. */
  clientToken?: string;
  environment?: 'sandbox' | 'production';
}

export interface IPaymentGateway {
  /**
   * Create a checkout session for subscription upgrade
   */
  createCheckoutSession(params: {
    planId: string;
    planPrice: number;
    planName: string;
    billingPeriod: 'monthly' | 'yearly';
    customer: PaymentCustomer;
    successUrl: string;
    cancelUrl: string;
    userId?: string;
    /** ISO 4217 code of the plan's price. Defaults to USD. */
    currency?: string;
  }): Promise<CheckoutSession>;

  /**
   * Get subscription details from the payment provider
   */
  getSubscriptionDetails(subscriptionId: string): Promise<SubscriptionDetails>;

  /**
   * Cancel subscription (either immediately or at period end)
   */
  cancelSubscription(subscriptionId: string, cancelAtPeriodEnd?: boolean): Promise<void>;

  /**
   * Get the provider name
   */
  getProviderName(): string;
}

export type PaymentProvider = 'stripe' | 'lemonsqueezy' | 'twocheckout' | 'paddle';

/** Feature flag that gates each provider (feature_flags.key). */
export const PAYMENT_PROVIDER_FLAGS: Record<PaymentProvider, string> = {
  stripe: 'paymentStripe',
  lemonsqueezy: 'paymentLemonSqueezy',
  twocheckout: 'paymentTwoCheckout',
  paddle: 'paymentPaddle',
};
