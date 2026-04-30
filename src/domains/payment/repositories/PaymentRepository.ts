import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';
import { DatabaseFacade } from '@facades/DatabaseFacade';

export interface PaymentRecord {
    id: string;
    userId: string;
    subscriptionId?: string;
    stripePaymentIntentId?: string;
    stripeInvoiceId?: string;
    stripeChargeId?: string;
    amount: number;
    currency: string;
    status: string;
    type: string;
    invoiceUrl?: string;
    invoicePdf?: string;
    description?: string;
    createdAt: Date;
    updatedAt: Date;
}

export class PaymentRepository {
    constructor(@Inject(TOKENS.Database) private db: DatabaseFacade) {}

    async create(data: Omit<PaymentRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<PaymentRecord> {
        const result = await this.db.query(
            `INSERT INTO payments (
                user_id, subscription_id, stripe_payment_intent_id, stripe_invoice_id,
                stripe_charge_id, amount, currency, status, type, invoice_url,
                invoice_pdf, description
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *`,
            [
                data.userId,
                data.subscriptionId,
                data.stripePaymentIntentId,
                data.stripeInvoiceId,
                data.stripeChargeId,
                data.amount,
                data.currency,
                data.status,
                data.type,
                data.invoiceUrl,
                data.invoicePdf,
                data.description,
            ]
        );
        return this.mapToPaymentRecord(result.rows[0]);
    }

    async findByUserId(userId: string, limit = 20, offset = 0): Promise<PaymentRecord[]> {
        const result = await this.db.query(
            `SELECT * FROM payments 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );
        return result.rows.map(this.mapToPaymentRecord);
    }

    async findById(id: string): Promise<PaymentRecord | null> {
        const result = await this.db.query(
            'SELECT * FROM payments WHERE id = $1',
            [id]
        );
        return result.rows[0] ? this.mapToPaymentRecord(result.rows[0]) : null;
    }

    async findByStripeInvoiceId(invoiceId: string): Promise<PaymentRecord | null> {
        const result = await this.db.query(
            'SELECT * FROM payments WHERE stripe_invoice_id = $1',
            [invoiceId]
        );
        return result.rows[0] ? this.mapToPaymentRecord(result.rows[0]) : null;
    }

    async findBySubscriptionId(subscriptionId: string): Promise<PaymentRecord[]> {
        const result = await this.db.query(
            `SELECT * FROM payments 
            WHERE subscription_id = $1 
            ORDER BY created_at DESC`,
            [subscriptionId]
        );
        return result.rows.map(this.mapToPaymentRecord);
    }

    async countByUserId(userId: string): Promise<number> {
        const result = await this.db.query(
            'SELECT COUNT(*) FROM payments WHERE user_id = $1',
            [userId]
        );
        return parseInt(result.rows[0].count);
    }

    async update(id: string, data: Partial<PaymentRecord>): Promise<PaymentRecord | null> {
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (data.status !== undefined) {
            updates.push(`status = $${paramIndex++}`);
            values.push(data.status);
        }
        if (data.invoicePdf !== undefined) {
            updates.push(`invoice_pdf = $${paramIndex++}`);
            values.push(data.invoicePdf);
        }
        if (data.invoiceUrl !== undefined) {
            updates.push(`invoice_url = $${paramIndex++}`);
            values.push(data.invoiceUrl);
        }

        if (updates.length === 0) {
            return this.findById(id);
        }

        updates.push(`updated_at = NOW()`);
        values.push(id);

        const result = await this.db.query(
            `UPDATE payments SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );
        return result.rows[0] ? this.mapToPaymentRecord(result.rows[0]) : null;
    }

    private mapToPaymentRecord(row: any): PaymentRecord {
        return {
            id: row.id,
            userId: row.user_id,
            subscriptionId: row.subscription_id,
            stripePaymentIntentId: row.stripe_payment_intent_id,
            stripeInvoiceId: row.stripe_invoice_id,
            stripeChargeId: row.stripe_charge_id,
            amount: row.amount,
            currency: row.currency,
            status: row.status,
            type: row.type,
            invoiceUrl: row.invoice_url,
            invoicePdf: row.invoice_pdf,
            description: row.description,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}