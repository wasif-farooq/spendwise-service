import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import fixture from '../../fixtures/data/coingecko-simple-price.json';

/**
 * P11 crypto currencies: registry and rounding, validation, the `crypto` flag
 * gate, CoinGecko parsing and storage, USD-pivot conversion, totals that skip
 * missing rates, the admin-only guard and the crypto cron.
 */

jest.mock('@config/ConfigLoader', () => ({
  ConfigLoader: {
    getInstance: () => ({
      get: (key: string) =>
        ({
          'exchangeRates.crypto': {
            baseUrl: 'https://cg.test/api/v3/',
            apiKey: '',
            timeoutMs: 500,
          },
        })[key],
    }),
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  CRYPTO_CURRENCIES,
  decimalsOf,
  isCrypto,
  isFiat,
  isKnownCurrency,
  roundAmount,
} = require('@domains/currencies/currencies');
const { currencyCode } = require('@domains/currencies/currencyCode');
const {
  requireCryptoFlagForCurrency,
  rejectCryptoBaseCurrency,
} = require('@domains/currencies/cryptoFlag.middleware');
const { TotalsConverter } = require('@domains/currencies/TotalsConverter');
const {
  CryptoRateProvider,
  COINGECKO_USER_AGENT,
  parseCoinGeckoPrices,
} = require('@domains/exchange-rates/services/CryptoRateProvider');
const { ExchangeRateService } = require('@domains/exchange-rates/services/ExchangeRateService');
const { ExchangeRate } = require('@domains/exchange-rates/models/ExchangeRate');
const { AccountService } = require('@domains/accounts/services/AccountService');
const { AnalyticsService } = require('@domains/analytics/services/AnalyticsService');
const { requireAdmin } = require('@shared/middleware/admin.middleware');
const { validateBody } = require('@shared/middleware/validateBody.middleware');
const { CronScheduler } = require('../../../src/workers/scheduler');
/* eslint-enable @typescript-eslint/no-var-requires */

/** In-memory exchange_rates table keyed by "BASE>TARGET". */
const memoryRates = (seed: Record<string, number> = {}) => {
  const rows = new Map<string, number>(Object.entries(seed));
  return {
    rows,
    async findByCurrencies(base: string, target: string) {
      const rate = rows.get(`${base}>${target}`);
      return rate === undefined
        ? null
        : ExchangeRate.restore(
            { baseCurrency: base, targetCurrency: target, rate, fetchedAt: new Date() },
            'id',
          );
    },
    async save(rate: any) {
      rows.set(`${rate.baseCurrency}>${rate.targetCurrency}`, rate.rate);
      return rate;
    },
    async findAll() {
      return [];
    },
  };
};

describe('currency registry', () => {
  it('lists 20 unique crypto codes with CoinGecko ids and 8 decimals', () => {
    const codes = CRYPTO_CURRENCIES.map((c: any) => c.code);
    expect(codes).toHaveLength(20);
    expect(new Set(codes).size).toBe(20);
    for (const coin of CRYPTO_CURRENCIES) {
      expect(coin.decimals).toBe(8);
      expect(coin.coingeckoId).toMatch(/^[a-z0-9-]+$/);
      expect(isFiat(coin.code)).toBe(false);
    }
    expect(codes).toEqual(expect.arrayContaining(['BTC', 'ETH', 'USDT', 'USDC', 'DOGE', 'SHIB']));
  });

  it('tells crypto from fiat, case-insensitively', () => {
    expect(isCrypto('btc')).toBe(true);
    expect(isCrypto('USD')).toBe(false);
    expect(isFiat('pkr')).toBe(true);
    expect(isKnownCurrency('XYZ')).toBe(false);
    expect(decimalsOf('BTC')).toBe(8);
    expect(decimalsOf('USD')).toBe(2);
    expect(decimalsOf(undefined)).toBe(2);
  });

  it('rounds to the currency decimals without float noise', () => {
    expect(roundAmount(0.00012345, 'BTC')).toBe(0.00012345);
    expect(roundAmount(0.123456785, 'BTC')).toBe(0.12345679);
    expect(roundAmount(0.000000001, 'BTC')).toBe(0);
    expect(roundAmount(1.005, 'USD')).toBe(1.01);
    expect(roundAmount(-2.675, 'EUR')).toBe(-2.68);
    expect(roundAmount(0.1 + 0.2, 'USD')).toBe(0.3);
    expect(roundAmount(0.001, 'USD')).toBe(0);
  });
});

describe('currencyCode schema', () => {
  const schema = z.object({ currency: currencyCode() });

  it.each(['USD', 'pkr', 'BTC', 'USDT', 'usdc', 'DOGE', 'SHIB'])('accepts %s', (code) => {
    const parsed = schema.safeParse({ currency: code });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.currency).toBe(code.toUpperCase());
  });

  it.each(['US', 'XYZ', 'NOTACOIN', 'BTC1', '', 'ABCDEFGHIJK'])('rejects %s', (code) => {
    expect(schema.safeParse({ currency: code }).success).toBe(false);
  });
});

describe('crypto flag gate', () => {
  const app = (enabled: boolean | 'throws', existing?: string | null) => {
    const a = express();
    a.use(express.json());
    const gate = requireCryptoFlagForCurrency(
      async () => {
        if (enabled === 'throws') throw new Error('flags down');
        return enabled;
      },
      existing === undefined ? {} : { existingCurrency: async () => existing },
    );
    a.post(
      '/accounts',
      validateBody(z.object({ currency: currencyCode() })),
      gate,
      (req: any, res: any) => res.status(201).json(req.body),
    );
    a.put('/preferences', rejectCryptoBaseCurrency, (_req: any, res: any) =>
      res.json({ ok: true }),
    );
    return a;
  };

  it('answers 400 CURRENCY_NOT_SUPPORTED for crypto while the flag is off', async () => {
    const res = await request(app(false)).post('/accounts').send({ currency: 'btc' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CURRENCY_NOT_SUPPORTED');
  });

  it('counts a failed flag lookup as off', async () => {
    const res = await request(app('throws')).post('/accounts').send({ currency: 'ETH' });
    expect(res.status).toBe(400);
  });

  it('lets crypto through when the flag is on', async () => {
    const res = await request(app(true)).post('/accounts').send({ currency: 'btc' });
    expect(res.status).toBe(201);
    expect(res.body.currency).toBe('BTC');
  });

  it('never reads the flag for fiat', async () => {
    const isEnabled = jest.fn(async () => false);
    const a = express();
    a.use(express.json());
    a.post('/x', requireCryptoFlagForCurrency(isEnabled), (_req: any, res: any) =>
      res.sendStatus(204),
    );
    const res = await request(a).post('/x').send({ currency: 'USD' });
    expect(res.status).toBe(204);
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it('keeps an existing crypto account working while the flag is off', async () => {
    expect(
      (await request(app(false, 'BTC')).post('/accounts').send({ currency: 'BTC' })).status,
    ).toBe(201);
    expect(
      (await request(app(false, 'BTC')).post('/accounts').send({ currency: 'ETH' })).status,
    ).toBe(400);
  });

  it('rejects an unknown currency before the gate (zod 400)', async () => {
    const res = await request(app(true)).post('/accounts').send({ currency: 'XYZ' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('keeps the preference currency fiat-only', async () => {
    expect((await request(app(true)).put('/preferences').send({ currency: 'BTC' })).status).toBe(
      400,
    );
    expect((await request(app(true)).put('/preferences').send({ currency: 'PKR' })).status).toBe(
      200,
    );
  });
});

describe('CoinGecko crypto rates', () => {
  it('parses the fixture into USD prices, dropping bad values', () => {
    const prices = parseCoinGeckoPrices(fixture);
    expect(prices.BTC).toBe(64000);
    expect(prices.SHIB).toBe(0.0000165);
    expect(prices.DAI).toBeUndefined();
    expect(Object.keys(prices)).toHaveLength(19);
    expect(parseCoinGeckoPrices(null)).toEqual({});
  });

  it('calls /simple/price with a User-Agent and the key only as a header', async () => {
    const fetchFn = jest.fn(async () => new Response(JSON.stringify(fixture), { status: 200 }));
    const repo = memoryRates();
    const provider = new CryptoRateProvider(repo as any, { apiKey: 'demo-key' }, fetchFn as any);

    const result = await provider.fetchAndStoreRates();

    const [url, init] = (fetchFn.mock.calls[0] as any[]) ?? [];
    expect(url).toMatch(/^https:\/\/cg\.test\/api\/v3\/simple\/price\?ids=bitcoin%2Cethereum/);
    expect(url).toContain('vs_currencies=usd');
    expect(url).not.toContain('demo-key');
    expect(init.headers['User-Agent']).toBe(COINGECKO_USER_AGENT);
    expect(init.headers['x-cg-demo-api-key']).toBe('demo-key');

    expect(result).toMatchObject({ success: true, count: 19, missing: ['DAI'] });
    expect(repo.rows.get('USD>BTC')).toBeCloseTo(1 / 64000, 15);
  });

  it('sends no key header without a key and reports upstream errors', async () => {
    const fetchFn = jest.fn(async () => new Response('slow down', { status: 429 }));
    const provider = new CryptoRateProvider(memoryRates() as any, {}, fetchFn as any);
    const result = await provider.fetchAndStoreRates();
    expect((fetchFn.mock.calls[0] as any[])[1].headers['x-cg-demo-api-key']).toBeUndefined();
    expect(result).toMatchObject({ success: false, count: 0, errors: ['CoinGecko returned 429'] });
  });
});

describe('USD-pivot conversion', () => {
  it('converts BTC -> PKR through USD -> BTC and USD -> PKR', async () => {
    const repo = memoryRates({ 'USD>BTC': 1 / 64000, 'USD>PKR': 280 });
    const service = new ExchangeRateService(repo as any, {} as any);
    const result = await service.convert(0.00012345, 'BTC', 'PKR');
    expect(result.rate).toBeCloseTo(64000 * 280, 4);
    expect(result.convertedAmount).toBeCloseTo(0.00012345 * 64000 * 280, 6);

    const back = await service.convert(1000, 'PKR', 'BTC');
    expect(back.convertedAmount).toBeCloseTo(1000 / 280 / 64000, 12);
  });

  it('still throws when a leg is missing', async () => {
    const service = new ExchangeRateService(memoryRates({ 'USD>PKR': 280 }) as any, {} as any);
    await expect(service.convert(1, 'BTC', 'PKR')).rejects.toThrow(/not found/);
  });
});

describe('totals skip missing rates', () => {
  const rates: Record<string, number> = { 'BTC>USD': 64000 };
  const rateOf = async (from: string, to: string) => {
    const rate = rates[`${from}>${to}`];
    if (!rate) throw new Error('no rate');
    return rate;
  };

  it('TotalsConverter never counts a missing rate as 1', async () => {
    const converter = new TotalsConverter('USD', rateOf);
    expect(await converter.convert(10, 'USD')).toBe(10);
    expect(await converter.convert(0.5, 'BTC')).toBe(32000);
    expect(await converter.convert(3, 'ETH')).toBeNull();
    expect(await converter.convert(1, 'eth')).toBeNull();
    expect(converter.unconvertedCurrencies()).toEqual(['ETH']);
  });

  it('accounts total leaves unconverted currencies out and lists them', async () => {
    const repo = {
      getBalancesByCurrency: async () => [
        { currency: 'BTC', total: 0.00012345 },
        { currency: 'ETH', total: 2 },
        { currency: 'USD', total: 100.1 },
      ],
    };
    const exchange = {
      convert: async (_a: number, f: string, t: string) => ({ rate: await rateOf(f, t) }),
    };
    const service = new AccountService(repo as any, exchange as any);
    const total = await service.getTotalBalance('ws', 'USD');
    expect(total).toEqual({ total: 108.0, currency: 'USD', unconvertedCurrencies: ['ETH'] });
  });

  it('analytics overview skips transactions it cannot convert', async () => {
    const db = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)')) return { rows: [{ count: '3' }] };
        if (sql.includes('t.date < $3')) return { rows: [] };
        return {
          rows: [
            { amount: '0.00012345', type: 'income', currency: 'BTC' },
            { amount: '5.00000000', type: 'expense', currency: 'ETH' },
            { amount: '1.50000000', type: 'expense', currency: 'USD' },
          ],
        };
      }),
    };
    const exchange = {
      convert: async (_a: number, f: string, t: string) => ({ rate: await rateOf(f, t) }),
    };
    const analytics = new AnalyticsService(db as any, {} as any, {} as any, exchange as any);
    const overview = await analytics.getOverview('ws', 'month', { preferredCurrency: 'USD' });
    expect(overview.monthlyIncome).toBe(7.9);
    expect(overview.monthlyExpenses).toBe(1.5);
    expect(overview.currency).toBe('USD');
    expect(overview.unconvertedCurrencies).toEqual(['ETH']);
  });
});

describe('requireAdmin', () => {
  const app = (role: string | null | Error) => {
    const a = express();
    a.use((req: any, _res, next) => {
      req.user = { userId: 'u1' };
      next();
    });
    a.post(
      '/fetch',
      requireAdmin(async () => {
        if (role instanceof Error) throw role;
        return role;
      }),
      (_req: any, res: any) => res.sendStatus(204),
    );
    return a;
  };

  it('lets SUPER_ADMIN and staff through', async () => {
    expect((await request(app('SUPER_ADMIN')).post('/fetch')).status).toBe(204);
    expect((await request(app('staff')).post('/fetch')).status).toBe(204);
  });

  it('refuses everyone else, and a failed lookup', async () => {
    expect((await request(app('pro')).post('/fetch')).status).toBe(403);
    expect((await request(app(null)).post('/fetch')).status).toBe(403);
    expect((await request(app(new Error('db'))).post('/fetch')).status).toBe(403);
  });
});

describe('crypto rates cron', () => {
  const make = (enabled: boolean) => {
    let now = new Date('2026-09-30T10:03:00Z');
    const fetchCryptoRates = jest.fn(async () => ({ success: true, count: 19 }));
    const scheduler = new CronScheduler({
      exchangeRates: () => ({ fetchAllRates: jest.fn(), fetchCryptoRates }),
      isCryptoEnabled: async () => enabled,
      now: () => now,
    });
    return {
      scheduler,
      fetchCryptoRates,
      advance: (minutes: number) => {
        now = new Date(now.getTime() + minutes * 60_000);
      },
    };
  };

  it('does nothing while the flag is off', async () => {
    const { scheduler, fetchCryptoRates } = make(false);
    await scheduler.checkCryptoRates();
    expect(fetchCryptoRates).not.toHaveBeenCalled();
  });

  it('fetches at most every 10 minutes while the flag is on', async () => {
    const { scheduler, fetchCryptoRates, advance } = make(true);
    await scheduler.checkCryptoRates();
    advance(5);
    await scheduler.checkCryptoRates();
    expect(fetchCryptoRates).toHaveBeenCalledTimes(1);
    advance(5);
    await scheduler.checkCryptoRates();
    expect(fetchCryptoRates).toHaveBeenCalledTimes(2);
  });
});
