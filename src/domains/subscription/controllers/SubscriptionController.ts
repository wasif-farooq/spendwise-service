import { Request, Response } from 'express';
import { SubscriptionRequestRepository } from '../repositories/SubscriptionRequestRepository';
import { AccountRequestRepository } from '@domains/accounts/repositories/AccountRequestRepository';

export class SubscriptionController {
    constructor(
        private subscriptionRequestRepository: SubscriptionRequestRepository,
        private accountRequestRepository?: AccountRequestRepository
    ) { }

    private getUserId(req: Request): string {
        return (req as any).user?.userId || (req as any).user?.id || (req as any).user?.sub;
    }

    private async calculateFeatureUsage(userId: string): Promise<{
        members: number;
        accounts: number;
        workspaces: number;
        customRoles: number;
    }> {
        try {
            let accounts = 0;
            if (this.accountRequestRepository) {
                const result = await this.accountRequestRepository.getAccounts('', userId);
                accounts = result.data?.length || 0;
            }

            return {
                members: 0,
                accounts,
                workspaces: 0,
                customRoles: 0,
            };
        } catch (error) {
            console.error('Error calculating feature usage:', error);
            return {
                members: 0,
                accounts: 0,
                workspaces: 0,
                customRoles: 0,
            };
        }
    }

    async getCurrentSubscription(req: Request, res: Response) {
        try {
            const userId = this.getUserId(req);

            if (!userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }

            const subscriptionResult = await this.subscriptionRequestRepository.getCurrentSubscription(userId);
            const featureUsage = await this.calculateFeatureUsage(userId);

            if (subscriptionResult.error) {
                throw new Error(subscriptionResult.error);
            }

            const subscription = subscriptionResult.data;

            if (!subscription) {
                const plansResult = await this.subscriptionRequestRepository.getPlans();
                const defaultPlan = plansResult.data?.find((p: any) => p.name?.toLowerCase() === 'free') || plansResult.data?.[0];

                return res.json({
                    subscription: {
                        plan: defaultPlan?.name?.toLowerCase() || 'free',
                        status: 'active',
                        startDate: new Date(),
                        features: defaultPlan?.features || [],
                        limits: defaultPlan?.limits || {}
                    },
                    featureUsage
                });
            }

            const plansResult = await this.subscriptionRequestRepository.getPlans();
            const plan = plansResult.data?.find((p: any) => p.id === subscription.planId);

            return res.json({
                subscription: {
                    plan: plan?.name?.toLowerCase() || 'pro',
                    status: subscription.status,
                    startDate: subscription.startDate,
                    features: subscription.featuresSnapshot || plan?.features || [],
                    limits: subscription.limitsSnapshot || plan?.limits || {},
                    paymentProvider: subscription.paymentProvider,
                },
                featureUsage
            });
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }

    async getPlans(req: Request, res: Response) {
        try {
            const result = await this.subscriptionRequestRepository.getPlans();

            if (result.error) {
                throw new Error(result.error);
            }

            return res.json({
                plans: result.data?.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    price: {
                        monthly: p.price,
                        yearly: p.yearlyPrice
                    },
                    currency: p.currency,
                    billingPeriod: p.billingPeriod,
                    description: p.description,
                    features: p.featuresDisplay?.length > 0 ? p.featuresDisplay : p.features,
                    limits: p.limits,
                    popular: p.isFeatured
                })) || []
            });
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }

    async subscribe(req: Request, res: Response) {
        try {
            const userId = this.getUserId(req);
            const { planId, paymentMethod } = req.body;

            if (!userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }

            const result = await this.subscriptionRequestRepository.subscribe(
                userId,
                { planId, paymentMethodId: paymentMethod || '2checkout' }
            );

            if (result.error) {
                throw new Error(result.error);
            }

            return res.status(201).json({
                message: 'Subscription created successfully',
                subscription: {
                    plan: result.data?.planId,
                    status: result.data?.status,
                    startDate: result.data?.startDate,
                }
            });

        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    }

    async upgrade(req: Request, res: Response) {
        try {
            const userId = this.getUserId(req);
            const { planId, paymentMethod } = req.body;

            if (!userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }

            const result = await this.subscriptionRequestRepository.upgrade(userId, planId);

            if (result.error) {
                throw new Error(result.error);
            }

            return res.json({
                message: 'Subscription upgraded successfully',
                subscription: {
                    plan: result.data?.planId,
                    status: result.data?.status,
                    startDate: result.data?.startDate,
                }
            });

        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    }

    async downgrade(req: Request, res: Response) {
        try {
            const userId = this.getUserId(req);
            const { planId } = req.body;

            if (!userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }

            const result = await this.subscriptionRequestRepository.downgrade(userId, planId);

            if (result.error) {
                throw new Error(result.error);
            }

            return res.json({
                message: 'Subscription downgraded successfully',
                subscription: {
                    plan: result.data?.planId,
                    status: result.data?.status,
                    startDate: result.data?.startDate,
                }
            });

        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    }

    async getFeatureUsage(req: Request, res: Response) {
        try {
            const userId = this.getUserId(req);
            if (!userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }

            const usage = await this.calculateFeatureUsage(userId);
            return res.json({ usage });
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }

    async cancel(req: Request, res: Response) {
        try {
            const userId = this.getUserId(req);

            if (!userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }

            const result = await this.subscriptionRequestRepository.cancel(userId);

            if (result.error) {
                throw new Error(result.error);
            }

            return res.json({
                message: 'Subscription cancelled successfully',
                subscription: {
                    plan: result.data?.planId,
                    status: result.data?.status,
                    cancelledAt: result.data?.cancelledAt,
                }
            });

        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    }
}