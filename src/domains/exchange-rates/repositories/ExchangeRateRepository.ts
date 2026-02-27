import { DatabaseFacade } from '@facades/DatabaseFacade';
import { ExchangeRate, ExchangeRateProps } from '../models/ExchangeRate';

export class ExchangeRateRepository {
    constructor(private db: DatabaseFacade) { }

    async findAll(baseCurrency?: string): Promise<ExchangeRate[]> {
        let query = 'SELECT * FROM exchange_rates';
        const params: any[] = [];

        if (baseCurrency) {
            query += ' WHERE base_currency = $1';
            params.push(baseCurrency);
        }

        query += ' ORDER BY target_currency ASC';

        const result = await this.db.query(query, params);
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    async findByCurrencies(baseCurrency: string, targetCurrency: string): Promise<ExchangeRate | null> {
        const result = await this.db.query(
            'SELECT * FROM exchange_rates WHERE base_currency = $1 AND target_currency = $2',
            [baseCurrency, targetCurrency]
        );
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    async save(exchangeRate: ExchangeRate): Promise<ExchangeRate> {
        const data = exchangeRate.getProps();
        
        // Upsert: update if exists, insert if not
        const result = await this.db.query(
            `INSERT INTO exchange_rates (id, base_currency, target_currency, rate, fetched_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (base_currency, target_currency) 
             DO UPDATE SET rate = $4, fetched_at = $5
             RETURNING *`,
            [
                exchangeRate.id,
                data.baseCurrency,
                data.targetCurrency,
                data.rate,
                data.fetchedAt
            ]
        );

        return this.mapToEntity(result.rows[0]);
    }

    async saveMany(exchangeRates: ExchangeRate[]): Promise<void> {
        for (const rate of exchangeRates) {
            await this.save(rate);
        }
    }

    async delete(baseCurrency?: string): Promise<void> {
        if (baseCurrency) {
            await this.db.query('DELETE FROM exchange_rates WHERE base_currency = $1', [baseCurrency]);
        } else {
            await this.db.query('DELETE FROM exchange_rates');
        }
    }

    async getLatestFetchDate(baseCurrency?: string): Promise<Date | null> {
        let query = 'SELECT MAX(fetched_at) as latest FROM exchange_rates';
        const params: any[] = [];

        if (baseCurrency) {
            query += ' WHERE base_currency = $1';
            params.push(baseCurrency);
        }

        const result = await this.db.query(query, params);
        return result.rows[0]?.latest || null;
    }

    private mapToEntity(row: any): ExchangeRate {
        const props: ExchangeRateProps = {
            baseCurrency: row.base_currency,
            targetCurrency: row.target_currency,
            rate: parseFloat(row.rate),
            fetchedAt: row.fetched_at,
        };
        return ExchangeRate.restore(props, row.id);
    }
}
