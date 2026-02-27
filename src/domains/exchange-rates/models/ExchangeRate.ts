import { Entity } from '@shared/Entity';

export interface ExchangeRateProps {
    baseCurrency: string;
    targetCurrency: string;
    rate: number;
    fetchedAt: Date;
}

export class ExchangeRate extends Entity<ExchangeRateProps> {
    private constructor(props: ExchangeRateProps, id: string) {
        super(props, id);
    }

    static create(props: Omit<ExchangeRateProps, 'fetchedAt'>, id?: string): ExchangeRate {
        return new ExchangeRate(
            {
                ...props,
                fetchedAt: new Date(),
            },
            id || crypto.randomUUID()
        );
    }

    static restore(props: ExchangeRateProps, id: string): ExchangeRate {
        return new ExchangeRate(props, id);
    }

    get baseCurrency(): string { return this.props.baseCurrency; }
    get targetCurrency(): string { return this.props.targetCurrency; }
    get rate(): number { return this.props.rate; }
    get fetchedAt(): Date { return this.props.fetchedAt; }

    toJSON() {
        return {
            id: this.id,
            baseCurrency: this.baseCurrency,
            targetCurrency: this.targetCurrency,
            rate: this.rate,
            fetchedAt: this.fetchedAt,
        };
    }
}
