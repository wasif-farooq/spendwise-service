import { Request, Response } from 'express';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { SubscriptionService } from '@domains/subscription/services/SubscriptionService';
import { IUserRepository } from '@domains/auth/repositories/IUserRepository';
import { OrganizationService } from '@domains/organizations/services/OrganizationService';

export class SubscriptionController {

    private get subscriptionService(): SubscriptionService {
        return Container.getInstance().resolve<SubscriptionService>(TOKENS.SubscriptionService);
    }

    private get organizationService(): OrganizationService {
        return Container.getInstance().resolve<OrganizationService>(TOKENS.OrganizationService);
    }

    async getCurrentSubscription(req: Request, res: Response) {
        try {
            const userId = (req as any).user.userId;
            const orgIdHeader = req.headers['x-organization-id'] as string;

            let organizationId = orgIdHeader;

            // If no header, try to find default org for user
            if (!organizationId) {
                const orgs = await this.organizationService.getUserOrganizations(userId);
                if (orgs.length > 0) {
                    organizationId = orgs[0].id;
                }
            }

            if (!organizationId) {
                return res.status(404).json({ message: 'Organization not found' });
            }

            const subscription = await this.subscriptionService.getCurrentSubscription(organizationId);

            if (!subscription) {
                // Return default/free plan details if no explicit subscription
                // Or "Pro" as per previous requirement for new users if we want to stick to that.
                // But generally the service should handle defaults or return null.
                // If null, we can return a constructed "Free" or "Pro" response.

                // For now, let's look up the default plan from DB
                const plans = await this.subscriptionService.getPlans();
                const defaultPlan = plans.find(p => p.name.toLowerCase() === 'pro') || plans[0]; // Default to Pro as requested

                return res.json({
                    subscription: {
                        plan: defaultPlan?.name.toLowerCase() || 'free',
                        status: 'active', // Implicitly active default
                        startDate: new Date(),
                        features: defaultPlan?.features || [],
                        limits: defaultPlan?.limits || {}
                    },
                    featureUsage: {
                        members: 0,
                        accounts: 0,
                        organizations: 1,
                        customRoles: 0,
                    }
                });
            }

            return res.json({
                subscription: {
                    plan: subscription.planId, // This might be UUID, need to fetch plan details if name needed, but ID is fine for now if consistent
                    status: subscription.status,
                    startDate: subscription.startDate,
                    features: subscription.featuresSnapshot,
                    limits: subscription.limitsSnapshot,
                    paymentProvider: subscription.paymentProvider,
                },
                featureUsage: {
                    members: 0, // Mock usage, needs real implementation later
                    accounts: 0,
                    organizations: 1,
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

    async upgrade(req: Request, res: Response) {
        try {
            const userId = (req as any).user.userId;
            const { planId, paymentMethod } = req.body; // paymentMethod token from frontend
            const orgIdHeader = req.headers['x-organization-id'] as string;

            if (!orgIdHeader) {
                return res.status(400).json({ message: 'Organization ID header is required' });
            }

            // In a real app, verify user has permission to upgrade organization

            const subscription = await this.subscriptionService.upgrade(orgIdHeader, planId);

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
            const orgIdHeader = req.headers['x-organization-id'] as string;

            if (!orgIdHeader) {
                return res.status(400).json({ message: 'Organization ID header is required' });
            }

            const subscription = await this.subscriptionService.downgrade(orgIdHeader, planId);

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
                organizations: 1,
                customRoles: 0,
            }
        });
    }
}
