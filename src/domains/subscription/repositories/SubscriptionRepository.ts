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
            price: parseFloat(row.price_monthly),
            yearlyPrice: parseFloat(row.price_yearly) || 0,
            currency: row.currency,
            billingPeriod: 'monthly',
            description: row.description,
            features: row.features || [], // JSONB auto-parsed
            featuresDisplay: row.features_display || row.features || [], // Use display names if available
            limits: row.limits || {}, // JSONB auto-parsed
            isActive: row.is_active,
            isFeatured: row.is_featured || false,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }, row.id);
    }

    protected mapToDb(data: any): any {
        const mapped = super.mapToDb(data);
        if (mapped.features) mapped.features = JSON.stringify(mapped.features);
        if (mapped.featuresDisplay) mapped.features_display = JSON.stringify(mapped.featuresDisplay);
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
            featuresSnapshot: typeof row.features_snapshot === 'string' ? JSON.parse(row.features_snapshot) : row.features_snapshot,
            limitsSnapshot: typeof row.limits_snapshot === 'string' ? JSON.parse(row.limits_snapshot) : row.limits_snapshot,
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

    async findByMerchantSubscriptionId(merchantSubscriptionId: string): Promise<UserSubscription | null> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE merchant_subscription_id = $1 LIMIT 1`,
            [merchantSubscriptionId]
        );
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    async updateStatusAndPeriod(
        id: string,
        status: string,
        currentPeriodEnd?: Date,
        cancelAtPeriodEnd?: boolean
    ): Promise<void> {
        const updates: string[] = ['status = $2', 'updated_at = NOW()'];
        const params: any[] = [id, status];
        let paramIndex = 3;

        if (currentPeriodEnd !== undefined) {
            updates.push(`current_period_end = $${paramIndex++}`);
            params.push(currentPeriodEnd);
        }

        if (cancelAtPeriodEnd !== undefined) {
            updates.push(`cancel_at_period_end = $${paramIndex++}`);
            params.push(cancelAtPeriodEnd);
        }

        if (status === 'cancelled' && !cancelAtPeriodEnd) {
            updates.push('cancelled_at = NOW()');
        }

        await this.db.query(
            `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = $1`,
            params
        );
    }
}
