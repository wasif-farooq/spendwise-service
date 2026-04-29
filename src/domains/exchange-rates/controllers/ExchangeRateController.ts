import { Request, Response } from 'express';
import { ExchangeRateRequestRepository } from '../repositories/ExchangeRateRequestRepository';

export class ExchangeRateController {
    constructor(private exchangeRateRequestRepository: ExchangeRateRequestRepository) { }

    async getRates(req: Request, res: Response) {
        try {
            const { base } = req.query;
            const result = await this.exchangeRateRequestRepository.getRates(base as string);

            if (result.error) {
                throw new Error(result.error);
            }

            res.json({
                rates: result.data?.map((r: any) => r.toJSON ? r.toJSON() : r) || [],
                count: result.data?.length || 0,
                baseCurrency: base || 'USD'
            });
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async convert(req: Request, res: Response) {
        try {
            const { amount, from, to } = req.query;

            if (!amount || !from || !to) {
                res.status(400).json({ message: 'Missing required parameters: amount, from, to' });
                return;
            }

            const result = await this.exchangeRateRequestRepository.convert(
                parseFloat(amount as string),
                from as string,
                to as string,
                ''
            );

            if (result.error) {
                throw new Error(result.error);
            }

            res.json(result.data);
        } catch (error: any) {
            res.status(400).json({ message: error.message });
        }
    }

    async fetchRates(req: Request, res: Response) {
        try {
            const { base } = req.query;
            const result = await this.exchangeRateRequestRepository.fetchRates(base as string || 'USD');

            if (result.error) {
                throw new Error(result.error);
            }

            res.json(result.data);
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }

    async getSupportedCurrencies(req: Request, res: Response) {
        try {
            const currencies = this.exchangeRateRequestRepository.getSupportedCurrencies();
            res.json({ currencies });
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }
}