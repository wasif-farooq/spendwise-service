import { Entity } from '@shared/Entity';

export interface TransactionProps {
    accountId: string;
    userId: string;
    workspaceId: string;
    type: 'income' | 'expense';
    amount: number;
    currency: string;
    description?: string;
    date: Date;
    categoryId?: string;
    categoryName?: string | null;
    // For linked transactions (multiple)
    linkedTransactionIds?: string[];
    exchangeRate?: number;
    // Converted amount in destination currency (for transfers)
    convertedAmount?: number;
    // Base amount in USD for conversions
    baseAmount?: number;
    // Receipt/file attachment
    receiptId?: string;
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
    get categoryName(): string | null | undefined { return this.props.categoryName; }
    get linkedTransactionIds(): string[] | undefined { return this.props.linkedTransactionIds; }
    get exchangeRate(): number | undefined { return this.props.exchangeRate; }
    get convertedAmount(): number | undefined { return this.props.convertedAmount; }
    get baseAmount(): number | undefined { return this.props.baseAmount; }
    get receiptId(): string | undefined { return this.props.receiptId; }
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
            categoryName: this.categoryName,
            linkedTransactionIds: this.linkedTransactionIds,
            exchangeRate: this.exchangeRate,
            convertedAmount: this.convertedAmount,
            baseAmount: this.baseAmount,
            receiptId: this.receiptId,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}
