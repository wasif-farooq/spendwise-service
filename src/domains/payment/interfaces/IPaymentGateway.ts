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
    url: string;
    sessionId: string;
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

export type PaymentProvider = 'stripe' | 'lemonsqueezy' | 'twocheckout';