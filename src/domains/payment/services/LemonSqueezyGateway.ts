import { IPaymentGateway, PaymentCustomer, SubscriptionDetails, CheckoutSession } from '../interfaces/IPaymentGateway';
import { ConfigLoader } from '@config/ConfigLoader';

interface LemonSqueezyCheckoutResponse {
    data: {
        attributes: {
            url: string;
            checkout_id: string;
        };
    };
}

interface LemonSqueezySubscriptionResponse {
    data: {
        attributes: {
            id: string;
            status: string;
            variant_id: string;
            renews_at: string | null;
            cancelled: boolean;
        };
    };
}

export class LemonSqueezyGateway implements IPaymentGateway {
    private apiKey: string;
    private storeId: string;
    private baseUrl = 'https://api.lemonsqueezy.com/v1';

    constructor() {
        const config = ConfigLoader.getInstance();
        this.apiKey = config.get('lemonsqueezy.apiKey') || '';
        this.storeId = config.get('lemonsqueezy.storeId') || '';

        if (!this.apiKey || !this.storeId) {
            throw new Error('LEMONSQUEEZY_API_KEY or LEMONSQUEEZY_STORE_ID is not configured');
        }
    }

    private async makeRequest(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Accept': 'application/vnd.api+json',
                'Content-Type': 'application/vnd.api+json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const errorData = await response.json();
            const errorMsg = (errorData as any)?.errors?.[0]?.detail || response.statusText;
            throw new Error(`Lemon Squeezy API error: ${errorMsg}`);
        }

        return response.json();
    }

    async createCheckoutSession(params: {
        planId: string;
        planPrice: number;
        planName: string;
        billingPeriod: 'monthly' | 'yearly';
        customer: PaymentCustomer;
        successUrl: string;
        cancelUrl: string;
    }): Promise<CheckoutSession> {
        const { planId, billingPeriod, customer, successUrl, cancelUrl } = params;

        const variantId = this.getVariantIdForPlan(planId, billingPeriod);

        const checkoutData = {
            data: {
                type: 'checkouts',
                attributes: {
                    checkout_data: {
                        email: customer.email,
                        name: customer.name,
                        custom: {
                            plan_id: planId,
                            user_email: customer.email,
                        },
                    },
                    preview: false,
                    success_url: successUrl,
                    cancel_url: cancelUrl,
                },
                relationships: {
                    store: {
                        data: {
                            type: 'stores',
                            id: this.storeId,
                        },
                    },
                    variant: {
                        data: {
                            type: 'variants',
                            id: variantId,
                        },
                    },
                },
            },
        };

        const response = await this.makeRequest('/checkouts', 'POST', checkoutData) as LemonSqueezyCheckoutResponse;

        return {
            url: response.data.attributes.url,
            sessionId: response.data.attributes.checkout_id,
        };
    }

    async getSubscriptionDetails(subscriptionId: string): Promise<SubscriptionDetails> {
        const response = await this.makeRequest(`/subscriptions/${subscriptionId}`) as LemonSqueezySubscriptionResponse;
        const attrs = response.data.attributes;

        let status: SubscriptionDetails['status'] = 'active';
        if (attrs.cancelled || attrs.status === 'cancelled') {
            status = 'cancelled';
        } else if (attrs.status === 'past_due') {
            status = 'past_due';
        } else if (attrs.status === 'trialing') {
            status = 'trialing';
        }

        return {
            id: subscriptionId,
            status,
            planId: '',
            currentPeriodEnd: attrs.renews_at ? new Date(attrs.renews_at) : undefined,
            cancelAtPeriodEnd: attrs.cancelled,
        };
    }

    async cancelSubscription(subscriptionId: string, cancelAtPeriodEnd: boolean = true): Promise<void> {
        if (cancelAtPeriodEnd) {
            await this.makeRequest(`/subscriptions/${subscriptionId}`, 'PATCH', {
                data: {
                    type: 'subscriptions',
                    attributes: {
                        cancelled: true,
                    },
                },
            });
        } else {
            await this.makeRequest(`/subscriptions/${subscriptionId}`, 'PATCH', {
                data: {
                    type: 'subscriptions',
                    attributes: {
                        cancelled: true,
                        immediatecancellation: true,
                    },
                },
            });
        }
    }

    getProviderName(): string {
        return 'lemonsqueezy';
    }

    private getVariantIdForPlan(planId: string, billingPeriod: 'monthly' | 'yearly'): string {
        const variantMap: Record<string, { monthly: string; yearly: string }> = {
            'starter': {
                monthly: process.env.LEMONSQUEEZY_STARTER_MONTHLY_VARIANT_ID || '',
                yearly: process.env.LEMONSQUEEZY_STARTER_YEARLY_VARIANT_ID || '',
            },
            'pro': {
                monthly: process.env.LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID || '',
                yearly: process.env.LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID || '',
            },
            'business': {
                monthly: process.env.LEMONSQUEEZY_BUSINESS_MONTHLY_VARIANT_ID || '',
                yearly: process.env.LEMONSQUEEZY_BUSINESS_YEARLY_VARIANT_ID || '',
            },
        };

        const variant = variantMap[planId]?.[billingPeriod];
        if (!variant) {
            throw new Error(`No variant configured for plan ${planId} with billing period ${billingPeriod}`);
        }

        return variant;
    }
}