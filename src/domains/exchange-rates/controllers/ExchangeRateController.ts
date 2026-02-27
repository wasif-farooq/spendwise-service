import { Request, Response } from 'express';
import { ExchangeRateService } from '../services/ExchangeRateService';
import { ExchangeRateRepository } from '../repositories/ExchangeRateRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { PostgresFactory } from '@database/factories/PostgresFactory';

export class ExchangeRateController {
    private service: ExchangeRateService;

    constructor() {
        const db = new DatabaseFacade(new PostgresFactory());
        const repository = new ExchangeRateRepository(db);
        this.service = new ExchangeRateService(repository);
    }

    // Get all exchange rates
    async getRates(req: Request, res: Response) {
        try {
            const { base } = req.query;
            const rates = await this.service.getRates(base as string);
            
            res.json({
                rates: rates.map(r => r.toJSON()),
                count: rates.length,
                baseCurrency: base || 'USD'
            });
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    // Convert currency
    async convert(req: Request, res: Response) {
        try {
            const { amount, from, to } = req.query;

            if (!amount || !from || !to) {
                res.status(400).json({ message: 'Missing required parameters: amount, from, to' });
                return;
            }

            const result = await this.service.convert(
                parseFloat(amount as string),
                from as string,
                to as string
            );

            res.json(result);
        } catch (error: any) {
            res.status(400).json({ message: error.message });
        }
    }

    // Manually fetch latest rates
    async fetchRates(req: Request, res: Response) {
        try {
            const { base } = req.query;
            const result = await this.service.fetchAndStoreRates(base as string || 'USD');
            
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    // Get supported currencies
    async getSupportedCurrencies(req: Request, res: Response) {
        try {
            const currencies = this.service.getSupportedCurrencies();
            res.json({ currencies });
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }
}
