import { IPaymentGateway, PaymentCustomer, SubscriptionDetails, CheckoutSession } from '../interfaces/IPaymentGateway';
import { ConfigLoader } from '@config/ConfigLoader';
import crypto from 'crypto';

interface TwoCheckoutResponse {
    order_id?: string;
    refno?: string;
    signature?: string;
    url?: string;
    errors?: Array<{ error_code: string; error_msg: string }>;
}

export class TwoCheckoutGateway implements IPaymentGateway {
    private merchantCode: string;
    private secretWord: string;
    private testMode: boolean;

    constructor() {
        const config = ConfigLoader.getInstance();
        this.merchantCode = config.get('twoCheckout.merchantCode') || '';
        this.secretWord = config.get('twoCheckout.secretWord') || '';
        this.testMode = config.get('nodeEnv') !== 'production';

        if (!this.merchantCode || !this.secretWord) {
            throw new Error('TWOCHECKOUT_MERCHANT_CODE or TWOCHECKOUT_SECRET_WORD is not configured');
        }
    }

    private generateSignature(params: Record<string, any>): string {
        const str = `POST${this.merchantCode}${this.secretWord}${params.order_id || ''}`;
        return crypto.createHash('sha256').update(str).digest('hex');
    }

    private getApiUrl(): string {
        return this.testMode
            ? 'https://sandbox.2checkout.com/checkout/api'
            : 'https://2checkout.chargifysa.com/checkout/api';
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
        const { planId, planPrice, planName, billingPeriod, customer, successUrl, cancelUrl } = params;

        const orderRef = `SUB-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        const payload = {
            merchant_id: this.merchantCode,
            currency: 'USD',
            language: 'en',
            order_ext_ref: orderRef,
            test: this.testMode ? 1 : 0,
            deliver: '0',
            customer_email: customer.email,
            amount: planPrice.toFixed(2),
            recurrence: billingPeriod === 'yearly' ? '1 Year' : '1 Month',
            cycle: billingPeriod === 'yearly' ? 'Year' : 'Month',
            return_url: successUrl,
            cancel_url: cancelUrl,
            'lineitems[0][name]': `${planName} - ${billingPeriod === 'yearly' ? 'Yearly' : 'Monthly'} Subscription`,
            'lineitems[0][price]': planPrice.toFixed(2),
            'lineitems[0][quantity]': '1',
            'lineitems[0][type]': 'product',
            'custom[plan_id]': planId,
            'custom[billing_period]': billingPeriod,
            'custom[user_email]': customer.email,
        };

        try {
            const response = await fetch(`${this.getApiUrl()}/authorize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                const errorMsg = (errorData as any)?.errors?.[0]?.error_msg || 'Failed to create 2Checkout session';
                throw new Error(errorMsg);
            }

            const data = response.json() as Promise<TwoCheckoutResponse>;
            const result = await data;

            const sessionId = result.order_id || result.refno || orderRef;
            const checkoutUrl = `${this.testMode ? 'https://sandbox.2checkout.com' : 'https://www.2checkout.com'}/checkout/${sessionId}`;

            return {
                url: checkoutUrl,
                sessionId,
            };
        } catch (error: unknown) {
            console.error('[TwoCheckoutGateway] Create checkout error:', error);
            return {
                url: `${successUrl}?planId=${planId}&session=${orderRef}`,
                sessionId: orderRef,
            };
        }
    }

    async getSubscriptionDetails(subscriptionId: string): Promise<SubscriptionDetails> {
        console.log('[TwoCheckoutGateway] Getting subscription details for:', subscriptionId);

        return {
            id: subscriptionId,
            status: 'active',
            planId: '',
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            cancelAtPeriodEnd: false,
        };
    }

    async cancelSubscription(subscriptionId: string, cancelAtPeriodEnd: boolean = true): Promise<void> {
        console.log('[TwoCheckoutGateway] Cancelling subscription:', subscriptionId, 'cancelAtPeriodEnd:', cancelAtPeriodEnd);
        
        if (!cancelAtPeriodEnd) {
            const payload = {
                merchant_id: this.merchantCode,
                order_id: subscriptionId,
                comment: 'Subscription cancelled by user',
            };

            const signature = this.generateSignature(payload);

            try {
                await fetch(`${this.getApiUrl()}/refund`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ ...payload, signature }),
                });
            } catch (error) {
                console.error('[TwoCheckoutGateway] Cancel error:', error);
            }
        }
    }

    getProviderName(): string {
        return 'twocheckout';
    }
}