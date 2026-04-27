import { Entity } from '@shared/Entity';

export interface SubscriptionPlanProps {
    name: string;
    price: number;
    yearlyPrice: number;
    currency: string;
    billingPeriod: 'monthly' | 'yearly';
    description?: string;
    features: string[];
    featuresDisplay: string[];
    limits: Record<string, number>;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export class SubscriptionPlan extends Entity<SubscriptionPlanProps> {
    private constructor(props: SubscriptionPlanProps, id?: string) {
        super(props, id);
    }

    public static restore(props: SubscriptionPlanProps, id: string): SubscriptionPlan {
        return new SubscriptionPlan(props, id);
    }

    get name(): string { return this.props.name; }
    get price(): number { return this.props.price; }
    get yearlyPrice(): number { return this.props.yearlyPrice; }
    get currency(): string { return this.props.currency; }
    get billingPeriod(): string { return this.props.billingPeriod; }
    get description(): string | undefined { return this.props.description; }
    get features(): string[] { return this.props.features; }
    get featuresDisplay(): string[] { return this.props.featuresDisplay; }
    get limits(): Record<string, number> { return this.props.limits; }
    get isActive(): boolean { return this.props.isActive; }
}
