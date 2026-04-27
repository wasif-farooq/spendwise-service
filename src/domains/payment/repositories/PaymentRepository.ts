import { BaseRepository } from '@shared/repositories/BaseRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';

export interface PaymentSessionProps {
    id?: string;
    userId: string;
    planId: string;
    provider: string;
    sessionId: string;
    status: 'pending' | 'completed' | 'failed' | 'cancelled';
    amount: number;
    currency?: string;
    billingPeriod: 'monthly' | 'yearly';
    createdAt?: Date;
    updatedAt?: Date;
}

export class PaymentSession {
    private props: PaymentSessionProps;

    constructor(props: PaymentSessionProps) {
        this.props = { ...props };
    }

    static create(props: PaymentSessionProps): PaymentSession {
        return new PaymentSession({
            ...props,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }

    static restore(props: PaymentSessionProps, id: string): PaymentSession {
        return new PaymentSession({ ...props, id });
    }

    get id(): string | undefined { return this.props.id; }
    get userId(): string { return this.props.userId; }
    get planId(): string { return this.props.planId; }
    get provider(): string { return this.props.provider; }
    get sessionId(): string { return this.props.sessionId; }
    get status(): string { return this.props.status; }
    get amount(): number { return this.props.amount; }
    get billingPeriod(): string { return this.props.billingPeriod; }
    get createdAt(): Date | undefined { return this.props.createdAt; }
    get updatedAt(): Date | undefined { return this.props.updatedAt; }

    complete(): void {
        this.props.status = 'completed';
        this.props.updatedAt = new Date();
    }

    fail(): void {
        this.props.status = 'failed';
        this.props.updatedAt = new Date();
    }

    cancel(): void {
        this.props.status = 'cancelled';
        this.props.updatedAt = new Date();
    }

    getProps(): PaymentSessionProps {
        return { ...this.props };
    }
}

export class PaymentRepository extends BaseRepository<PaymentSession> {
    constructor(@Inject(TOKENS.Database) db: DatabaseFacade) {
        super(db, 'payment_sessions');
    }

    protected mapToEntity(row: any): PaymentSession {
        return PaymentSession.restore({
            id: row.id,
            userId: row.user_id,
            planId: row.plan_id,
            provider: row.provider,
            sessionId: row.session_id,
            status: row.status,
            amount: parseFloat(row.amount),
            currency: row.currency,
            billingPeriod: row.billing_period,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }, row.id);
    }

    protected mapToDb(data: any): any {
        const mapped = super.mapToDb(data);
        return mapped;
    }

    async findByUserId(userId: string): Promise<PaymentSession[]> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId]
        );
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    async findBySessionId(sessionId: string): Promise<PaymentSession | null> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE session_id = $1`,
            [sessionId]
        );
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    async findPendingByUserId(userId: string): Promise<PaymentSession | null> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
            [userId]
        );
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }
}