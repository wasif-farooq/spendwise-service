import { Entity } from '@shared/Entity';

export type AccountType = 'bank' | 'savings' | 'cash' | 'credit_card' | 'investment';
export type AccountTrend = 'up' | 'down' | 'stable';

export interface AccountProps {
    name: string;
    type: AccountType;
    balance: number;
    currency: string;
    color: string;
    organizationId: string;
    userId: string;
    lastActivity: Date;
    createdAt: Date;
    updatedAt: Date;
}

export class Account extends Entity<AccountProps> {
    private constructor(props: AccountProps, id?: string) {
        super(props, id);
    }

    public static create(props: {
        name: string;
        type: AccountType;
        balance: number;
        currency: string;
        color?: string;
        organizationId: string;
        userId: string;
    }, id?: string): Account {
        const now = new Date();
        const accountProps: AccountProps = {
            ...props,
            color: props.color || '#6b7280',
            lastActivity: now,
            createdAt: now,
            updatedAt: now,
        };
        return new Account(accountProps, id);
    }

    public static restore(props: AccountProps, id: string): Account {
        return new Account(props, id);
    }

    public updateBalance(newBalance: number): void {
        this.props.balance = newBalance;
        this.props.lastActivity = new Date();
        this.props.updatedAt = new Date();
    }

    public updateDetails(name: string, color: string): void {
        this.props.name = name;
        this.props.color = color;
        this.props.updatedAt = new Date();
    }

    // Getters
    get name(): string { return this.props.name; }
    get type(): AccountType { return this.props.type; }
    get balance(): number { return this.props.balance; }
    get currency(): string { return this.props.currency; }
    get color(): string { return this.props.color; }
    get organizationId(): string { return this.props.organizationId; }
    get userId(): string { return this.props.userId; }
    get lastActivity(): Date { return this.props.lastActivity; }
    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }
}
