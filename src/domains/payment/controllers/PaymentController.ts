import { Request, Response } from 'express';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { PaymentService } from '../services/PaymentService';
import { FeatureFlagService } from '@domains/feature-flags/services/FeatureFlagService';

interface PaymentGateway {
    id: string;
    name: string;
    enabled: boolean;
}

export class PaymentController {

    private get paymentService(): PaymentService {
        return PaymentService.getInstance();
    }

    private get featureFlagService(): FeatureFlagService {
        return Container.getInstance().resolve<FeatureFlagService>(TOKENS.FeatureFlagService);
    }

    async getGateways(req: Request, res: Response) {
        console.log('[PaymentController] getGateways called');
        console.log('[PaymentController] Headers:', req.headers);
        try {
            const gateways: PaymentGateway[] = [];

            const stripeEnabled = await this.featureFlagService.isEnabled('paymentStripe');
            const lemonSqueezyEnabled = await this.featureFlagService.isEnabled('paymentLemonSqueezy');
            const twoCheckoutEnabled = await this.featureFlagService.isEnabled('paymentTwoCheckout');

            if (stripeEnabled) {
                gateways.push({ id: 'stripe', name: 'Stripe', enabled: true });
            }
            if (lemonSqueezyEnabled) {
                gateways.push({ id: 'lemonsqueezy', name: 'Lemon Squeezy', enabled: true });
            }
            if (twoCheckoutEnabled) {
                gateways.push({ id: 'twocheckout', name: '2Checkout', enabled: true });
            }

            console.log('[PaymentController] gateways:', gateways);
            return res.json({ gateways });
        } catch (error: any) {
            console.error('[PaymentController] getGateways error:', error);
            return res.status(500).json({ message: error.message });
        }
    }

    async createCheckout(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.userId;
            if (!userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }

            const { planId, billingPeriod, paymentGateway } = req.body;

            if (!planId || !billingPeriod || !paymentGateway) {
                return res.status(400).json({ message: 'Missing required fields: planId, billingPeriod, paymentGateway' });
            }

            // Get user info for customer details
            const userRepo = Container.getInstance().resolve<any>('UserRepository');
            const user = await userRepo.findById(userId);

            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Get plan details
            const { SubscriptionPlanRepository } = require('@domains/subscription/repositories/SubscriptionRepository');
            const planRepo = Container.getInstance().resolve<any>(TOKENS.SubscriptionPlanRepository);
            const plan = await planRepo.findById(planId);

            if (!plan) {
                return res.status(404).json({ message: 'Plan not found' });
            }

            // Calculate price based on billing period
            const price = billingPeriod === 'yearly' ? plan.yearlyPrice : plan.price;

            // Create checkout session with selected gateway
            const checkoutSession = await this.paymentService.createCheckoutSession({
                planId: plan.id,
                planPrice: price,
                planName: plan.name,
                billingPeriod: billingPeriod as 'monthly' | 'yearly',
                customer: {
                    email: user.email,
                    name: `${user.firstName} ${user.lastName}`.trim() || user.email
                },
                successUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/checkout/success?session_id={sessionId}`,
                cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/checkout/cancel?planId=${planId}`,
                provider: paymentGateway as any
            });

            return res.json({
                checkoutUrl: checkoutSession.url,
                sessionId: checkoutSession.sessionId
            });
        } catch (error: any) {
            console.error('[PaymentController] createCheckout error:', error);
            return res.status(500).json({ message: error.message });
        }
    }
}