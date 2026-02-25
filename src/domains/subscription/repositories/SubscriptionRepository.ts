import { BaseRepository } from '@shared/repositories/BaseRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { SubscriptionPlan, SubscriptionPlanProps } from '../models/SubscriptionPlan';
import { UserSubscription, UserSubscriptionProps } from '../models/UserSubscription';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';

export class SubscriptionPlanRepository extends BaseRepository<SubscriptionPlan> {
    constructor(@Inject(TOKENS.Database) db: DatabaseFacade) {
        super(db, 'subscription_plans');
    }

    protected mapToEntity(row: any): SubscriptionPlan {
        return SubscriptionPlan.restore({
            name: row.name,
            price: parseFloat(row.price),
            currency: row.currency,
            billingPeriod: row.billing_period,
            description: row.description,
            features: row.features, // JSONB auto-parsed
            limits: row.limits, // JSONB auto-parsed
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }, row.id);
    }

    protected mapToDb(data: any): any {
        const mapped = super.mapToDb(data);
        if (mapped.features) mapped.features = JSON.stringify(mapped.features);
        if (mapped.limits) mapped.limits = JSON.stringify(mapped.limits);
        return mapped;
    }
}

export class UserSubscriptionRepository extends BaseRepository<UserSubscription> {
    constructor(@Inject(TOKENS.Database) db: DatabaseFacade) {
        super(db, 'user_subscriptions');
    }

    protected mapToEntity(row: any): UserSubscription {
        return UserSubscription.restore({
            userId: row.user_id,
            planId: row.plan_id,
            status: row.status,
            startDate: row.start_date,
            currentPeriodEnd: row.current_period_end,
            cancelledAt: row.cancelled_at,
            trialEndsAt: row.trial_ends_at,
            paymentProvider: row.payment_provider,
            merchantSubscriptionId: row.merchant_subscription_id,
            featuresSnapshot: row.features_snapshot,
            limitsSnapshot: row.limits_snapshot,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }, row.id);
    }

    protected mapToDb(data: any): any {
        const mapped = super.mapToDb(data);
        if (mapped.features_snapshot) mapped.features_snapshot = JSON.stringify(mapped.features_snapshot);
        if (mapped.limits_snapshot) mapped.limits_snapshot = JSON.stringify(mapped.limits_snapshot);
        return mapped;
    }

    async findByUserId(userId: string): Promise<UserSubscription | null> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [userId]
        );
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }
}
