import { Request, Response } from 'express';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { SubscriptionService } from '@domains/subscription/services/SubscriptionService';
import { IUserRepository } from '@domains/auth/repositories/IUserRepository';

export class SubscriptionController {

    private get subscriptionService(): SubscriptionService {
        return Container.getInstance().resolve<SubscriptionService>(TOKENS.SubscriptionService);
    }

    async getCurrentSubscription(req: Request, res: Response) {
        try {
            const userId = (req as any).user.userId;

            if (!userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }

            const subscription = await this.subscriptionService.getCurrentSubscription(userId);

            if (!subscription) {
                // Return default/free plan details if no explicit subscription
                const plans = await this.subscriptionService.getPlans();
                const defaultPlan = plans.find(p => p.name.toLowerCase() === 'free') || plans[0];

                return res.json({
                    subscription: {
                        plan: defaultPlan?.name.toLowerCase() || 'free',
                        status: 'active',
                        startDate: new Date(),
                        features: defaultPlan?.features || [],
                        limits: defaultPlan?.limits || {}
                    },
                    featureUsage: {
                        members: 0,
                        accounts: 0,
                        workspaces: 0,
                        customRoles: 0,
                    }
                });
            }

            return res.json({
                subscription: {
                    plan: subscription.planId,
                    status: subscription.status,
                    startDate: subscription.startDate,
                    features: subscription.featuresSnapshot,
                    limits: subscription.limitsSnapshot,
                    paymentProvider: subscription.paymentProvider,
                },
                featureUsage: {
                    members: 0,
                    accounts: 0,
                    workspaces: 0,
                    customRoles: 0,
                }
            });
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }

    async getPlans(req: Request, res: Response) {
        try {
            const plans = await this.subscriptionService.getPlans();
            return res.json({
                plans: plans.map(p => ({
                    id: p.id,
                    name: p.name,
                    price: p.price,
                    currency: p.currency,
                    billingPeriod: p.billingPeriod,
                    description: p.description,
                    features: p.features,
                    limits: p.limits
                }))
            });
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }

    async subscribe(req: Request, res: Response) {
        try {
            const userId = (req as any).user.userId;
            const { planId, paymentMethod } = req.body;

            if (!userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }

            const subscription = await this.subscriptionService.subscribe(
                userId, 
                planId, 
                { provider: paymentMethod || '2checkout', subscriptionId: `sub_${Date.now()}` }
            );

            return res.status(201).json({
                message: 'Subscription created successfully',
                subscription: {
                    plan: subscription.planId,
                    status: subscription.status,
                    startDate: subscription.startDate,
                }
            });

        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    }

    async upgrade(req: Request, res: Response) {
        try {
            const userId = (req as any).user.userId;
            const { planId, paymentMethod } = req.body;

            if (!userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }

            const subscription = await this.subscriptionService.upgrade(userId, planId);

            return res.json({
                message: 'Subscription upgraded successfully',
                subscription: {
                    plan: subscription.planId,
                    status: subscription.status,
                    startDate: subscription.startDate,
                }
            });

        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    }

    async downgrade(req: Request, res: Response) {
        try {
            const userId = (req as any).user.userId;
            const { planId } = req.body;

            if (!userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }

            const subscription = await this.subscriptionService.downgrade(userId, planId);

            return res.json({
                message: 'Subscription downgraded successfully',
                subscription: {
                    plan: subscription.planId,
                    status: subscription.status,
                    startDate: subscription.startDate,
                }
            });

        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    }

    async getFeatureUsage(req: Request, res: Response) {
        // Mock usage for now
        return res.json({
            usage: {
                members: 0,
                accounts: 0,
                workspaces: 0,
                customRoles: 0,
            }
        });
    }
}
