import Stripe, { Stripe as StripeClient } from 'stripe';
import { IPaymentGateway, PaymentCustomer, SubscriptionDetails, CheckoutSession } from '../interfaces/IPaymentGateway';
import { ConfigLoader } from '@config/ConfigLoader';

export class StripeGateway implements IPaymentGateway {
    private stripe: StripeClient;

    constructor() {
        const config = ConfigLoader.getInstance();
        const secretKey = config.get('stripe.secretKey');
        
        if (!secretKey) {
            throw new Error('STRIPE_SECRET_KEY is not configured');
        }
        
        this.stripe = new Stripe(secretKey);
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
    }): Promise<CheckoutSession> {
        const { planId, planPrice, planName, billingPeriod, customer, successUrl, cancelUrl, userId } = params;

        let customerId: string;
        
        if (customer.id) {
            customerId = customer.id;
        } else {
            const newCustomer = await this.stripe.customers.create({
                email: customer.email,
                name: customer.name,
            });
            customerId = newCustomer.id;
        }

        const priceId = await this.createOrGetPrice(planId, planPrice, planName, billingPeriod);

        const sessionParams: any = {
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
                planId,
                billingPeriod,
            },
        };

        if (userId) {
            sessionParams.client_reference_id = userId;
            sessionParams.metadata.userId = userId;
        }

        const session = await this.stripe.checkout.sessions.create(sessionParams);

        return {
            url: session.url!,
            sessionId: session.id,
        };
    }

    async getSubscriptionDetails(subscriptionId: string): Promise<SubscriptionDetails> {
        const subscription = await this.stripe.subscriptions.retrieve(subscriptionId) as any;

        return {
            id: subscription.id,
            status: subscription.status as SubscriptionDetails['status'],
            planId: subscription.metadata?.planId || '',
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
        };
    }

    async cancelSubscription(subscriptionId: string, cancelAtPeriodEnd: boolean = true): Promise<void> {
        if (cancelAtPeriodEnd) {
            await this.stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: true,
            });
        } else {
            await this.stripe.subscriptions.cancel(subscriptionId);
        }
    }

    getProviderName(): string {
        return 'stripe';
    }

    private async createOrGetPrice(planId: string, unitAmount: number, productName: string, billingPeriod: 'monthly' | 'yearly'): Promise<string> {
        const billingInterval = billingPeriod === 'monthly' ? 'month' : 'year';
        
        const existingPrices = await this.stripe.prices.list({
            limit: 100,
            active: true,
        });

        const existingPrice = existingPrices.data.find(
            (price) =>
                price.metadata?.planId === planId &&
                price.recurring?.interval === billingInterval
        );

        if (existingPrice) {
            return existingPrice.id;
        }

        const product = await this.stripe.products.create({
            name: productName,
            metadata: { planId },
        });

        const price = await this.stripe.prices.create({
            product: product.id,
            unit_amount: Math.round(unitAmount * 100),
            currency: 'usd',
            recurring: {
                interval: billingInterval,
            },
            metadata: {
                planId,
                billingPeriod,
            },
        });

        return price.id;
    }
}