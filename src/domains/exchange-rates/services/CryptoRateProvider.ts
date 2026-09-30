import { ConfigLoader } from '@config/ConfigLoader';
import { CRYPTO_CURRENCIES, CryptoCurrency } from '@domains/currencies/currencies';
import { ExchangeRate } from '../models/ExchangeRate';
import type { ExchangeRateRepository } from '../repositories/ExchangeRateRepository';

export interface CryptoRateConfig {
  baseUrl: string;
  /** Optional CoinGecko demo key, sent as `x-cg-demo-api-key`. */
  apiKey: string;
  timeoutMs: number;
}

export interface CryptoFetchResult {
  success: boolean;
  count: number;
  baseCurrency: 'USD';
  /** Coins CoinGecko didn't price (their old rate, if any, is kept). */
  missing?: string[];
  errors?: string[];
}

export const COINGECKO_USER_AGENT = 'TrackMyPocket/1.0 (+https://trackmypocket.com)';

const DEFAULTS: CryptoRateConfig = {
  baseUrl: 'https://api.coingecko.com/api/v3',
  apiKey: '',
  timeoutMs: 10000,
};

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * USD prices for each coin, from a CoinGecko `/simple/price?vs_currencies=usd`
 * body ({ bitcoin: { usd: 65000 }, … }). Ids with no positive, finite price
 * are left out.
 */
export const parseCoinGeckoPrices = (
  body: unknown,
  coins: readonly CryptoCurrency[] = CRYPTO_CURRENCIES,
): Record<string, number> => {
  const prices: Record<string, number> = {};
  if (!body || typeof body !== 'object') return prices;
  const byId = body as Record<string, { usd?: unknown } | undefined>;
  for (const coin of coins) {
    const raw = byId[coin.coingeckoId]?.usd;
    const price = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
    if (Number.isFinite(price) && price > 0) prices[coin.code] = price;
  }
  return prices;
};

/**
 * Crypto rates from CoinGecko, one call for every listed coin. Each coin is
 * stored as `USD -> COIN = 1 / price`, so ExchangeRateService.convert reaches
 * any pair through its USD pivot (BTC -> PKR = BTC -> USD -> PKR).
 */
export class CryptoRateProvider {
  private readonly config: CryptoRateConfig;

  constructor(
    private readonly repository: ExchangeRateRepository,
    config?: Partial<CryptoRateConfig>,
    private readonly fetchFn: FetchFn = (url, init) => fetch(url, init),
  ) {
    this.config = { ...DEFAULTS, ...CryptoRateProvider.configured(), ...(config ?? {}) };
  }

  private static configured(): Partial<CryptoRateConfig> {
    try {
      const crypto = ConfigLoader.getInstance().get('exchangeRates.crypto') as
        | Partial<CryptoRateConfig>
        | undefined;
      if (!crypto) return {};
      const out: Partial<CryptoRateConfig> = {};
      if (crypto.baseUrl) out.baseUrl = crypto.baseUrl;
      if (crypto.apiKey) out.apiKey = crypto.apiKey;
      if (crypto.timeoutMs && crypto.timeoutMs > 0) out.timeoutMs = crypto.timeoutMs;
      return out;
    } catch {
      return {};
    }
  }

  /** The request, without the key (the key only travels as a header). */
  buildUrl(coins: readonly CryptoCurrency[] = CRYPTO_CURRENCIES): string {
    const ids = coins.map((c) => c.coingeckoId).join(',');
    const base = this.config.baseUrl.replace(/\/+$/, '');
    return `${base}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
  }

  async fetchPrices(): Promise<Record<string, number>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': COINGECKO_USER_AGENT,
    };
    if (this.config.apiKey) headers['x-cg-demo-api-key'] = this.config.apiKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetchFn(this.buildUrl(), { headers, signal: controller.signal });
      if (!response.ok) throw new Error(`CoinGecko returned ${response.status}`);
      return parseCoinGeckoPrices(await response.json());
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(`CoinGecko timed out after ${this.config.timeoutMs} ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchAndStoreRates(): Promise<CryptoFetchResult> {
    let prices: Record<string, number>;
    try {
      prices = await this.fetchPrices();
    } catch (error: any) {
      return { success: false, count: 0, baseCurrency: 'USD', errors: [error.message] };
    }

    const errors: string[] = [];
    let count = 0;
    for (const [code, price] of Object.entries(prices)) {
      try {
        await this.repository.save(
          ExchangeRate.create({ baseCurrency: 'USD', targetCurrency: code, rate: 1 / price }),
        );
        count++;
      } catch (error: any) {
        errors.push(`Failed to save ${code}: ${error.message}`);
      }
    }
    const missing = CRYPTO_CURRENCIES.map((c) => c.code).filter((code) => !(code in prices));

    return {
      success: count > 0,
      count,
      baseCurrency: 'USD',
      missing: missing.length ? missing : undefined,
      errors: errors.length ? errors : undefined,
    };
  }
}
