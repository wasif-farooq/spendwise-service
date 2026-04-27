import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';
import { AppError } from '@shared/errors/AppError';
import { SubscriptionPlanRepository, UserSubscriptionRepository } from '../repositories/SubscriptionRepository';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { UserSubscription } from '../models/UserSubscription';
import { PaymentService, getPaymentGateway } from '@domains/payment/services/PaymentService';
import { Container } from '@di/Container';

export class SubscriptionService {
    constructor(
        @Inject(TOKENS.SubscriptionPlanRepository) private planRepo: SubscriptionPlanRepository,
        @Inject(TOKENS.UserSubscriptionRepository) private subRepo: UserSubscriptionRepository
    ) { }

    async getPlans(): Promise<SubscriptionPlan[]> {
        return this.planRepo.findAll();
    }

    async getCurrentSubscription(userId: string): Promise<UserSubscription | null> {
        return this.subRepo.findByUserId(userId);
    }

    async subscribe(userId: string, planId: string, billingDetails: { provider: string, subscriptionId: string }): Promise<UserSubscription> {
        // Check if plan exists
        const plan = await this.planRepo.findById(planId);
        if (!plan) throw new AppError('Plan not found', 404);

        // Check if already subscribed
        const existingSub = await this.subRepo.findByUserId(userId);
        if (existingSub && existingSub.status === 'active') {
            throw new AppError('User already has an active subscription', 400);
        }

        // Create new subscription
        const newSub = UserSubscription.create(userId, plan, billingDetails);
        await this.subRepo.save(newSub);

        return newSub;
    }

    async upgrade(userId: string, planId: string): Promise<UserSubscription> {
        const sub = await this.subRepo.findByUserId(userId);
        if (!sub) throw new AppError('No active subscription found', 404);

        const newPlan = await this.planRepo.findById(planId);
        if (!newPlan) throw new AppError('Plan not found', 404);

        // Logic to verify upgrade vs downgrade could be here (e.g. check price)
        // For now allowing any change as "upgrade" process which snapshots new features.

        // In a real scenario, we would interact with Payment Provider (2Checkout) here
        // to update the subscription.
        const mockProviderDetails = {
            provider: sub.paymentProvider || '2checkout', // Default to existing or 2checkout
            subscriptionId: sub.merchantSubscriptionId || `mock-sub-${Date.now()}`
        };

        // Perform upgrade logic on model (snapshots features)
        sub.upgrade(newPlan, mockProviderDetails);

        await this.subRepo.save(sub);
        return sub;
    }

    async downgrade(userId: string, planId: string): Promise<UserSubscription> {
        // For now, downgrade uses same logic as upgrade (snapshotting the NEW plan's features)
        // But in some business logic, you might want to keep the OLD features until the end of the period.
        // The requirements said "if i made change is subscription plan it will not effect hose users", 
        // which refers to grandfathering.
        // When downgrading, usually the user ACCEPTS the new lower limits.
        // So snapshotting the new plan is correct.

        return this.upgrade(userId, planId);
    }

    /**
     * Check if user has reached a feature limit
     * @param userId - The user ID
     * @param feature - The feature name (e.g., 'accounts', 'transactions')
     * @param currentCount - Current count of the feature
     * @throws AppError if limit exceeded
     */
    async checkFeatureLimit(userId: string, feature: string, currentCount: number): Promise<void> {
        const subscription = await this.subRepo.findByUserId(userId);
        
        if (!subscription) {
            // No subscription - apply default limits or free tier limits
            const defaultLimit = 1; // Free tier
            if (currentCount >= defaultLimit) {
                throw new AppError(`You have reached the limit of ${defaultLimit} ${feature}. Please upgrade your plan.`, 403);
            }
            return;
        }

        const limits = subscription.limitsSnapshot;
        const limit = limits[feature];

        // If no limit defined for this feature, allow unlimited
        if (limit === undefined || limit === -1) {
            return;
        }

        if (currentCount >= limit) {
            throw new AppError(`You have reached the limit of ${limit} ${feature}. Please upgrade your plan.`, 403);
        }
    }

    /**
     * Check if account has reached monthly transaction limit
     * @param userId - The user ID (workspace owner)
     * @param accountId - The account ID to check
     * @param currentMonthCount - Current transaction count for this account this month
     * @throws AppError if limit exceeded
     */
    async checkAccountTransactionLimit(userId: string, accountId: string, currentMonthCount: number): Promise<void> {
        const subscription = await this.subRepo.findByUserId(userId);
        
        if (!subscription) {
            // No subscription - apply default limit
            const defaultLimit = 100; // Free tier
            if (currentMonthCount >= defaultLimit) {
                throw new AppError(`This account has reached ${defaultLimit} transactions this month. Please upgrade your plan to add more.`, 403);
            }
            return;
        }

        const limits = subscription.limitsSnapshot;
        const limit = limits['transactions_per_account'];

        // If no limit defined or -1 (unlimited), allow
        if (limit === undefined || limit === -1) {
            return;
        }

        if (currentMonthCount >= limit) {
            throw new AppError(`This account has reached ${limit} transactions this month. Please upgrade your plan to add more.`, 403);
        }
    }

    /**
     * Create a free subscription for a user upon registration
     * Looks up the 'free' plan from subscription_plans table and creates user_subscriptions record
     * @param userId - The user ID
     * @returns The created UserSubscription
     */
    async createFreeSubscription(userId: string): Promise<UserSubscription> {
        // Check if user already has a subscription
        const existingSub = await this.subRepo.findByUserId(userId);
        if (existingSub) {
            throw new AppError('User already has a subscription', 400);
        }

        // Get the free plan from database
        const freePlan = await this.planRepo.findById('free');
        if (!freePlan) {
            throw new AppError('Free plan not found in database. Please seed subscription plans.', 404);
        }

        // Create new subscription with free plan (snapshot features and limits)
        const newSub = UserSubscription.create(userId, freePlan);
        await this.subRepo.save(newSub);

        console.log(`[SubscriptionService] Created free subscription for user: ${userId}, plan: ${freePlan.name}`);
        return newSub;
    }

    /**
     * Cancel a user's subscription
     * @param userId - The user ID
     * @returns The cancelled UserSubscription
     */
    async cancelSubscription(userId: string): Promise<UserSubscription> {
        const subscription = await this.subRepo.findByUserId(userId);
        if (!subscription) {
            throw new AppError('No active subscription found', 404);
        }

        subscription.cancel();
        await this.subRepo.save(subscription);

        // Cancel via payment provider if there's a merchant subscription ID
        if (subscription.merchantSubscriptionId && subscription.paymentProvider) {
            try {
                const gateway = PaymentService.getInstance().getGateway(subscription.paymentProvider as any);
                await gateway.cancelSubscription(subscription.merchantSubscriptionId, true);
            } catch (error) {
                console.error('[SubscriptionService] Failed to cancel payment provider subscription:', error);
            }
        }

        console.log(`[SubscriptionService] Cancelled subscription for user: ${userId}`);
        return subscription;
    }

    /**
     * Create a checkout session for plan upgrade
     * @param userId - The user ID
     * @param planId - The plan to upgrade to
     * @param billingPeriod - monthly or yearly
     * @param successUrl - URL to redirect after successful payment
     * @param cancelUrl - URL to redirect after cancelled payment
     * @returns Checkout session URL and session ID
     */
    async createCheckoutSession(params: {
        userId: string;
        planId: string;
        billingPeriod: 'monthly' | 'yearly';
        successUrl: string;
        cancelUrl: string;
    }): Promise<{ url: string; sessionId: string }> {
        const { userId, planId, billingPeriod, successUrl, cancelUrl } = params;

        // Get the plan
        const plan = await this.planRepo.findById(planId);
        if (!plan) throw new AppError('Plan not found', 404);

        // Get the user's current subscription to get their email
        const userSub = await this.subRepo.findByUserId(userId);
        const userRepo = Container.getInstance().resolve<any>('UserRepository');
        const user = await userRepo.findById(userId);
        
        if (!user) throw new AppError('User not found', 404);

        // Calculate price based on billing period
        const price = billingPeriod === 'yearly' 
            ? (plan as any).yearlyPrice || (plan.price * 12 * 0.8)
            : plan.price;

        // Get the active payment gateway
        const gateway = await getPaymentGateway();

        // Create checkout session
        const session = await gateway.createCheckoutSession({
            planId: plan.id,
            planPrice: price,
            planName: plan.name,
            billingPeriod,
            customer: {
                email: user.email,
                name: `${user.firstName} ${user.lastName}`.trim(),
            },
            successUrl,
            cancelUrl,
        });

        return {
            url: session.url,
            sessionId: session.sessionId,
        };
    }

    /**
     * Confirm subscription after successful payment
     * Called by webhook or after redirect
     */
    async confirmSubscription(params: {
        userId: string;
        planId: string;
        provider: string;
        subscriptionId: string;
    }): Promise<UserSubscription> {
        const { userId, planId, provider, subscriptionId } = params;

        const plan = await this.planRepo.findById(planId);
        if (!plan) throw new AppError('Plan not found', 404);

        // Check for existing subscription
        const existingSub = await this.subRepo.findByUserId(userId);

        if (existingSub) {
            // Upgrade existing subscription
            existingSub.upgrade(plan, { provider, subscriptionId });
            await this.subRepo.save(existingSub);
            console.log(`[SubscriptionService] Upgraded subscription for user: ${userId}, plan: ${plan.name}`);
            return existingSub;
        } else {
            // Create new subscription
            const newSub = UserSubscription.create(userId, plan, { provider, subscriptionId });
            await this.subRepo.save(newSub);
            console.log(`[SubscriptionService] Created new subscription for user: ${userId}, plan: ${plan.name}`);
            return newSub;
        }
    }
}
