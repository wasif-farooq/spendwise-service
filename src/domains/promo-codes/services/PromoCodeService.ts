import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { AppError } from '@shared/errors/AppError';

export interface PromoCode {
    id: string;
    code: string;
    description?: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    maxUses?: number;
    currentUses: number;
    maxUsesPerUser: number;
    validFrom?: Date;
    validUntil?: Date;
    stripeCouponId?: string;
    isActive: boolean;
    createdAt: Date;
}

export interface PromoCodeUse {
    id: string;
    promoCodeId: string;
    userId: string;
    subscriptionId?: string;
    discountAmount: number;
    createdAt: Date;
}

export class PromoCodeService {
    constructor(@Inject(TOKENS.Database) private db: DatabaseFacade) {}

    async validate(code: string): Promise<{
        valid: boolean;
        discountType: 'percentage' | 'fixed';
        discountValue: number;
        description?: string;
    }> {
        const result = await this.db.query(
            `SELECT id, code, description, discount_type, discount_value, max_uses, 
                    current_uses, valid_from, valid_until, is_active
             FROM promo_codes 
             WHERE code = $1`,
            [code.toUpperCase()]
        );

        if (!result.rows[0]) {
            return { valid: false, discountType: 'percentage', discountValue: 0 };
        }

        const promo = result.rows[0];

        if (!promo.is_active) {
            return { valid: false, discountType: 'percentage', discountValue: 0 };
        }

        if (promo.max_uses && promo.current_uses >= promo.max_uses) {
            return { valid: false, discountType: 'percentage', discountValue: 0 };
        }

        const now = new Date();
        if (promo.valid_from && new Date(promo.valid_from) > now) {
            return { valid: false, discountType: 'percentage', discountValue: 0 };
        }
        if (promo.valid_until && new Date(promo.valid_until) < now) {
            return { valid: false, discountType: 'percentage', discountValue: 0 };
        }

        return {
            valid: true,
            discountType: promo.discount_type,
            discountValue: promo.discount_value,
            description: promo.description,
        };
    }

    async apply(code: string, userId: string, originalAmount: number): Promise<{
        applied: boolean;
        discountAmount: number;
        finalAmount: number;
    }> {
        const validation = await this.validate(code);
        
        if (!validation.valid) {
            return { applied: false, discountAmount: 0, finalAmount: originalAmount };
        }

        let discountAmount = 0;
        if (validation.discountType === 'percentage') {
            discountAmount = Math.round(originalAmount * (validation.discountValue / 100));
        } else {
            discountAmount = Math.min(validation.discountValue, originalAmount);
        }

        const promoResult = await this.db.query(
            `SELECT id FROM promo_codes WHERE code = $1`,
            [code.toUpperCase()]
        );
        
        const promoId = promoResult.rows[0]?.id;

        if (promoId) {
            await this.db.query(
                `INSERT INTO promo_code_uses (promo_code_id, user_id, discount_amount)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (promo_code_id, user_id) DO NOTHING`,
                [promoId, userId, discountAmount]
            );

            await this.db.query(
                `UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = $1`,
                [promoId]
            );
        }

        return {
            applied: true,
            discountAmount,
            finalAmount: originalAmount - discountAmount,
        };
    }

    async recordUse(code: string, userId: string, subscriptionId: string, discountAmount: number): Promise<void> {
        const promoResult = await this.db.query(
            `SELECT id FROM promo_codes WHERE code = $1`,
            [code.toUpperCase()]
        );

        const promoId = promoResult.rows[0]?.id;
        if (!promoId) return;

        await this.db.query(
            `INSERT INTO promo_code_uses (promo_code_id, user_id, subscription_id, discount_amount)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (promo_code_id, user_id) DO UPDATE SET
                subscription_id = $3, discount_amount = $4`,
            [promoId, userId, subscriptionId, discountAmount]
        );
    }

    async list(): Promise<PromoCode[]> {
        const result = await this.db.query(
            `SELECT * FROM promo_codes ORDER BY created_at DESC`
        );
        return result.rows.map(this.mapToPromoCode);
    }

    async create(data: {
        code: string;
        description?: string;
        discountType: 'percentage' | 'fixed';
        discountValue: number;
        maxUses?: number;
        maxUsesPerUser?: number;
        validFrom?: Date;
        validUntil?: Date;
    }): Promise<PromoCode> {
        const result = await this.db.query(
            `INSERT INTO promo_codes (
                code, description, discount_type, discount_value, max_uses, 
                max_uses_per_user, valid_from, valid_until
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
                data.code.toUpperCase(),
                data.description,
                data.discountType,
                data.discountValue,
                data.maxUses,
                data.maxUsesPerUser || 1,
                data.validFrom,
                data.validUntil,
            ]
        );
        return this.mapToPromoCode(result.rows[0]);
    }

    async deactivate(promoCodeId: string): Promise<void> {
        await this.db.query(
            `UPDATE promo_codes SET is_active = false WHERE id = $1`,
            [promoCodeId]
        );
    }

    async getByCode(code: string): Promise<PromoCode | null> {
        const result = await this.db.query(
            `SELECT * FROM promo_codes WHERE code = $1`,
            [code.toUpperCase()]
        );
        return result.rows[0] ? this.mapToPromoCode(result.rows[0]) : null;
    }

    private mapToPromoCode(row: any): PromoCode {
        return {
            id: row.id,
            code: row.code,
            description: row.description,
            discountType: row.discount_type,
            discountValue: row.discount_value,
            maxUses: row.max_uses,
            currentUses: row.current_uses,
            maxUsesPerUser: row.max_uses_per_user,
            validFrom: row.valid_from,
            validUntil: row.valid_until,
            stripeCouponId: row.stripe_coupon_id,
            isActive: row.is_active,
            createdAt: row.created_at,
        };
    }
}