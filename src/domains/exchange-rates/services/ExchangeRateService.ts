import { ExchangeRateRepository } from '../repositories/ExchangeRateRepository';
import { ExchangeRate } from '../models/ExchangeRate';
import { ConfigLoader } from '@config/ConfigLoader';

// List of supported currencies
const SUPPORTED_CURRENCIES = [
    'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'INR', 'MXN',
    'BRL', 'KRW', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'NZD', 'ZAR', 'RUB'
];

export class ExchangeRateService {
    private repository: ExchangeRateRepository;
    private config = ConfigLoader.getInstance();
    private apiKey: string;
    private baseUrl = 'https://api.exchangerate-api.com/v4/latest';

    constructor(repository: ExchangeRateRepository) {
        this.repository = repository;
        this.apiKey = this.config.get('exchangeRates.apiKey') || process.env.EXCHANGE_RATE_API_KEY || '';
    }

    // Fetch and store exchange rates for a base currency
    async fetchAndStoreRates(baseCurrency: string = 'USD'): Promise<{
        success: boolean;
        count: number;
        baseCurrency: string;
        errors?: string[];
    }> {
        const errors: string[] = [];
        
        try {
            // Fetch from external API
            const rates = await this.fetchRatesFromAPI(baseCurrency);
            
            if (!rates || Object.keys(rates).length === 0) {
                return {
                    success: false,
                    count: 0,
                    baseCurrency,
                    errors: ['No rates received from API']
                };
            }

            // Save to database
            let count = 0;
            for (const [targetCurrency, rate] of Object.entries(rates)) {
                try {
                    const exchangeRate = ExchangeRate.create({
                        baseCurrency,
                        targetCurrency,
                        rate: parseFloat(String(rate)),
                    });
                    await this.repository.save(exchangeRate);
                    count++;
                } catch (err: any) {
                    errors.push(`Failed to save ${targetCurrency}: ${err.message}`);
                }
            }

            return {
                success: count > 0,
                count,
                baseCurrency,
                errors: errors.length > 0 ? errors : undefined
            };
        } catch (err: any) {
            return {
                success: false,
                count: 0,
                baseCurrency,
                errors: [err.message]
            };
        }
    }

    // Fetch rates for all major base currencies
    async fetchAllRates(): Promise<{
        success: boolean;
        results: Array<{
            baseCurrency: string;
            count: number;
            success: boolean;
            errors?: string[];
        }>;
    }> {
        const results = [];
        const baseCurrencies = ['USD', 'EUR', 'GBP']; // Major currencies

        for (const base of baseCurrencies) {
            const result = await this.fetchAndStoreRates(base);
            results.push({
                baseCurrency: base,
                count: result.count,
                success: result.success,
                errors: result.errors
            });
        }

        return {
            success: results.some(r => r.success),
            results
        };
    }

    // Get all stored rates
    async getRates(baseCurrency?: string): Promise<ExchangeRate[]> {
        return this.repository.findAll(baseCurrency);
    }

    // Convert amount between currencies
    async convert(
        amount: number,
        fromCurrency: string,
        toCurrency: string
    ): Promise<{
        originalAmount: number;
        convertedAmount: number;
        rate: number;
        fromCurrency: string;
        toCurrency: string;
    }> {
        // Same currency - no conversion needed
        if (fromCurrency === toCurrency) {
            return {
                originalAmount: amount,
                convertedAmount: amount,
                rate: 1,
                fromCurrency,
                toCurrency
            };
        }

        // Try to get rate from database
        let rate = await this.getRate(fromCurrency, toCurrency);

        // If not found, try reverse
        if (!rate) {
            const reverseRate = await this.getRate(toCurrency, fromCurrency);
            if (reverseRate && reverseRate > 0) {
                rate = 1 / reverseRate;
            }
        }

        // If still not found, try USD as intermediate
        if (!rate && fromCurrency !== 'USD' && toCurrency !== 'USD') {
            const fromToUSD = await this.getRate(fromCurrency, 'USD');
            const usdToTo = await this.getRate('USD', toCurrency);
            if (fromToUSD && usdToTo) {
                rate = fromToUSD * usdToTo;
            }
        }

        if (!rate) {
            throw new Error(`Exchange rate not found for ${fromCurrency} to ${toCurrency}`);
        }

        return {
            originalAmount: amount,
            convertedAmount: amount * rate,
            rate,
            fromCurrency,
            toCurrency
        };
    }

    // Get single rate
    private async getRate(fromCurrency: string, toCurrency: string): Promise<number | null> {
        const exchangeRate = await this.repository.findByCurrencies(fromCurrency, toCurrency);
        return exchangeRate?.rate || null;
    }

    // Fetch from external API
    private async fetchRatesFromAPI(baseCurrency: string): Promise<Record<string, number>> {
        try {
            const response = await fetch(`${this.baseUrl}/${baseCurrency}`);
            
            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            const data = await response.json() as { rates?: Record<string, number> };
            return data.rates || {};
        } catch (err: any) {
            console.error('Failed to fetch exchange rates:', err.message);
            
            // Fallback: return some hardcoded rates if API fails
            return this.getFallbackRates(baseCurrency);
        }
    }

    // Fallback rates (approximate) if API is unavailable
    private getFallbackRates(baseCurrency: string): Record<string, number> {
        const usdRates: Record<string, number> = {
            USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, AUD: 1.53, CAD: 1.36, CHF: 0.88, CNY: 7.24, INR: 83.1, MXN: 17.15,
            BRL: 4.97, KRW: 1320, SGD: 1.34, HKD: 7.82, NOK: 10.65, SEK: 10.45, DKK: 6.87, NZD: 1.64, ZAR: 18.9, RUB: 92.5
        };

        if (baseCurrency === 'USD') {
            return usdRates;
        }

        // Convert to other base currency
        const baseRate = usdRates[baseCurrency] || 1;
        const converted: Record<string, number> = {};
        
        for (const [currency, rate] of Object.entries(usdRates)) {
            converted[currency] = rate / baseRate;
        }

        return converted;
    }

    // Get supported currencies
    getSupportedCurrencies(): string[] {
        return SUPPORTED_CURRENCIES;
    }
}
