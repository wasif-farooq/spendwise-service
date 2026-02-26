import { Entity } from '@shared/Entity';

export interface TransactionProps {
    accountId: string;
    userId: string;
    workspaceId: string;
    type: 'income' | 'expense' | 'transfer';
    amount: number;
    currency: string;
    description?: string;
    date: Date;
    categoryId?: string;
    // For transfer
    toAccountId?: string;
    exchangeRate?: number;
    // Base amount in USD for conversions
    baseAmount?: number;
    // Metadata
    createdAt: Date;
    updatedAt: Date;
}

export class Transaction extends Entity<TransactionProps> {
    private constructor(props: TransactionProps, id?: string) {
        super(props, id);
    }

    public static create(props: Omit<TransactionProps, 'createdAt' | 'updatedAt'>): Transaction {
        return new Transaction({
            ...props,
            createdAt: new Date(),
            updatedAt: new Date()
        });
    }

    public static restore(props: TransactionProps, id: string): Transaction {
        return new Transaction(props, id);
    }

    // Getters
    get accountId(): string { return this.props.accountId; }
    get userId(): string { return this.props.userId; }
    get workspaceId(): string { return this.props.workspaceId; }
    get type(): string { return this.props.type; }
    get amount(): number { return this.props.amount; }
    get currency(): string { return this.props.currency; }
    get description(): string | undefined { return this.props.description; }
    get date(): Date { return this.props.date; }
    get categoryId(): string | undefined { return this.props.categoryId; }
    get toAccountId(): string | undefined { return this.props.toAccountId; }
    get exchangeRate(): number | undefined { return this.props.exchangeRate; }
    get baseAmount(): number | undefined { return this.props.baseAmount; }
    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }

    toJSON() {
        return {
            id: this.id,
            accountId: this.accountId,
            userId: this.userId,
            workspaceId: this.workspaceId,
            type: this.type,
            amount: this.amount,
            currency: this.currency,
            description: this.description,
            date: this.date,
            categoryId: this.categoryId,
            toAccountId: this.toAccountId,
            exchangeRate: this.exchangeRate,
            baseAmount: this.baseAmount,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}
