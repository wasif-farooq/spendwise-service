import { Entity } from '@shared/Entity';
import { SubscriptionPlan } from './SubscriptionPlan';

export interface SubscriptionSnapshot {
    features: string[];
    limits: Record<string, number>;
}

export interface UserSubscriptionProps {
    userId: string;
    planId: string;
    status: 'active' | 'cancelled' | 'past_due' | 'trialing';
    startDate: Date;
    currentPeriodEnd?: Date;
    cancelledAt?: Date;
    trialEndsAt?: Date;
    paymentProvider?: string;
    merchantSubscriptionId?: string;
    featuresSnapshot: string[];
    limitsSnapshot: Record<string, number>;
    createdAt: Date;
    updatedAt: Date;
}

export class UserSubscription extends Entity<UserSubscriptionProps> {
    private constructor(props: UserSubscriptionProps, id?: string) {
        super(props, id);
    }

    public static create(userId: string, plan: SubscriptionPlan, billingDetails?: { provider: string, subscriptionId: string }): UserSubscription {
        const props: UserSubscriptionProps = {
            userId,
            planId: plan.id,
            status: 'active',
            startDate: new Date(),
            // Default 30 days
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            paymentProvider: billingDetails?.provider,
            merchantSubscriptionId: billingDetails?.subscriptionId,
            // Snapshot features from plan at creation time
            featuresSnapshot: [...plan.features],
            limitsSnapshot: { ...plan.limits },
            createdAt: new Date(),
            updatedAt: new Date()
        };
        return new UserSubscription(props);
    }

    public static restore(props: UserSubscriptionProps, id: string): UserSubscription {
        return new UserSubscription(props, id);
    }

    public upgrade(newPlan: SubscriptionPlan, billingDetails?: { provider: string, subscriptionId: string }): void {
        this.props.planId = newPlan.id;
        this.props.featuresSnapshot = [...newPlan.features];
        this.props.limitsSnapshot = { ...newPlan.limits };

        if (billingDetails) {
            this.props.paymentProvider = billingDetails.provider;
            this.props.merchantSubscriptionId = billingDetails.subscriptionId;
        }

        this.props.updatedAt = new Date();
    }

    // Getters
    get userId(): string { return this.props.userId; }
    get planId(): string { return this.props.planId; }
    get status(): string { return this.props.status; }
    get featuresSnapshot(): string[] { return this.props.featuresSnapshot; }
    get limitsSnapshot(): Record<string, number> { return this.props.limitsSnapshot; }
    get paymentProvider(): string | undefined { return this.props.paymentProvider; }
    get merchantSubscriptionId(): string | undefined { return this.props.merchantSubscriptionId; }
    get startDate(): Date { return this.props.startDate; }
    get currentPeriodEnd(): Date | undefined { return this.props.currentPeriodEnd; }
}
