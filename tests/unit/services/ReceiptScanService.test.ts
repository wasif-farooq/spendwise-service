import {
  ReceiptScanService,
  matchCategory,
  roundToMinor,
} from '@domains/ai/receipts/ReceiptScanService';
import type {
  IReceiptScanRepository,
  ReceiptScanAllowanceRow,
} from '@domains/ai/receipts/ReceiptScanRepository';
import { ReceiptExtractor, RawReceipt, receiptScanError } from '@domains/ai/receipts/types';

const NOW = new Date('2026-09-29T10:00:00Z');
const WS = 'ws-1';

const CATEGORIES = [
  { id: 'cat-groceries', name: 'Groceries', type: 'expense' as const },
  { id: 'cat-dining', name: 'Food & Dining', type: 'expense' as const },
  { id: 'cat-transport', name: 'Transportation', type: 'expense' as const },
  { id: 'cat-health', name: 'Health & Fitness', type: 'expense' as const },
  { id: 'cat-salary', name: 'Salary', type: 'income' as const },
];

const ACCOUNTS = [
  { id: 'acc-usd', name: 'Everyday Checking', currency: 'USD', lastActivity: new Date('2026-09-28') },
  { id: 'acc-eur', name: 'Euro Card', currency: 'EUR', lastActivity: new Date('2026-09-01') },
];

const receipt = (over: Partial<RawReceipt> = {}): RawReceipt => ({
  isReceipt: true,
  merchant: 'Corner Market',
  total: 23.456,
  subtotal: 21.5,
  tax: 1.956,
  currency: 'USD',
  date: '2026-09-20',
  category: 'Groceries',
  lineItems: [{ description: 'Milk', amount: 3.499 }],
  confidence: { total: 0.95, date: 0.9, merchant: 0.9 },
  ...over,
});

const FREE: ReceiptScanAllowanceRow = {
  ownerId: 'owner-1',
  hasSubscription: true,
  planName: 'Free',
  snapshotLimit: 5,
  planLimit: 5,
};

const setup = (opts: { raw?: RawReceipt; extractError?: Error; allowance?: ReceiptScanAllowanceRow; used?: number } = {}) => {
  const records: any[] = [];
  let used = opts.used ?? 0;
  const repository: jest.Mocked<IReceiptScanRepository> = {
    countSuccessfulForOwnerSince: jest.fn(async () => used),
    findAllowance: jest.fn(async () => opts.allowance ?? FREE),
    record: jest.fn(async (row) => {
      records.push(row);
      if (row.outcome === 'success') used += 1;
    }),
  };
  const extractor: ReceiptExtractor = {
    provider: 'opencode',
    model: 'mimo-v2.5-free',
    extract: jest.fn(async () => {
      if (opts.extractError) throw opts.extractError;
      return {
        receipt: opts.raw ?? receipt(),
        usage: { inputTokens: 1000, outputTokens: 100 },
        provider: 'opencode',
        model: 'mimo-v2.5-free',
      };
    }),
  };
  const service = new ReceiptScanService({
    extractor,
    repository,
    categories: { findAll: jest.fn(async () => CATEGORIES) },
    accounts: { findByWorkspaceId: jest.fn(async () => ACCOUNTS) },
    freeScansPerMonth: 5,
    now: () => NOW,
  });
  return { service, repository, extractor, records };
};

const scan = (service: ReceiptScanService) =>
  service.scan({ workspaceId: WS, userId: 'user-1', image: Buffer.from('x'), mimeType: 'image/jpeg' });

beforeEach(() => {
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('ReceiptScanService.scan', () => {
  it('passes expense category names, currency hint and today to the extractor', async () => {
    const { service, extractor } = setup();
    await scan(service);
    expect(extractor.extract).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: ['Groceries', 'Food & Dining', 'Transportation', 'Health & Fitness'],
        currencyHint: 'USD',
        today: '2026-09-29',
      }),
    );
  });

  it('maps the category, rounds to minor units and suggests the same-currency account', async () => {
    const { service, records } = setup();
    const result = await scan(service);

    expect(result).toMatchObject({
      merchant: 'Corner Market',
      total: 23.46,
      tax: 1.96,
      currency: 'USD',
      date: '2026-09-20',
      categoryId: 'cat-groceries',
      categoryName: 'Groceries',
      suggestedAccountId: 'acc-usd',
      warnings: [],
      usage: { used: 1, limit: 5, resetsAt: '2026-10-01T00:00:00.000Z' },
    });
    expect(result.lineItems[0].amount).toBe(3.5);
    expect(records).toEqual([
      expect.objectContaining({ outcome: 'success', inputTokens: 1000, outputTokens: 100, model: 'mimo-v2.5-free' }),
    ]);
  });

  it('rounds JPY to whole units', async () => {
    const { service } = setup({ raw: receipt({ currency: 'JPY', total: 1234.6 }) });
    const result = await scan(service);
    expect(result.total).toBe(1235);
  });

  it('clamps a future date to today with a warning', async () => {
    const { service } = setup({ raw: receipt({ date: '2026-12-25' }) });
    const result = await scan(service);
    expect(result.date).toBe('2026-09-29');
    expect(result.warnings.map((w) => w.code)).toContain('DATE_IN_FUTURE');
  });

  it('keeps tomorrow (users ahead of UTC) and drops an invalid date', async () => {
    const tomorrow = await scan(setup({ raw: receipt({ date: '2026-09-30' }) }).service);
    expect(tomorrow.date).toBe('2026-09-30');

    const invalid = await scan(setup({ raw: receipt({ date: '2026-02-31' }) }).service);
    expect(invalid.date).toBeNull();
    expect(invalid.warnings.map((w) => w.code)).toContain('DATE_MISSING');
  });

  it('warns when no account matches the receipt currency', async () => {
    const { service } = setup({ raw: receipt({ currency: 'GBP' }) });
    const result = await scan(service);
    expect(result.suggestedAccountId).toBe('acc-usd');
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'CURRENCY_MISMATCH', field: 'accountId' }),
    ]);
  });

  it('picks the EUR account for a EUR receipt', async () => {
    const result = await scan(setup({ raw: receipt({ currency: 'eur' }) }).service);
    expect(result.currency).toBe('EUR');
    expect(result.suggestedAccountId).toBe('acc-eur');
  });

  it('assumes the usual currency when the model gives none', async () => {
    const result = await scan(setup({ raw: receipt({ currency: null }) }).service);
    expect(result.currency).toBe('USD');
    expect(result.warnings.map((w) => w.code)).toEqual(['CURRENCY_ASSUMED']);
  });

  it('flags low-confidence fields', async () => {
    const result = await scan(
      setup({ raw: receipt({ confidence: { total: 0.4, date: 0.3, merchant: 0.9 } }) }).service,
    );
    expect(result.warnings.map((w) => w.code)).toEqual(['LOW_CONFIDENCE_TOTAL', 'LOW_CONFIDENCE_DATE']);
  });

  it('rejects a missing or non-positive total with 422 UNREADABLE (not counted)', async () => {
    for (const total of [null, 0, -3]) {
      const { service, records } = setup({ raw: receipt({ total }) });
      await expect(scan(service)).rejects.toMatchObject({ code: 'UNREADABLE', statusCode: 422 });
      expect(records[0].outcome).toBe('unreadable');
    }
  });

  it('answers 422 NOT_A_RECEIPT for other images', async () => {
    const { service, records } = setup({ raw: receipt({ isReceipt: false }) });
    await expect(scan(service)).rejects.toMatchObject({ code: 'NOT_A_RECEIPT', statusCode: 422 });
    expect(records[0].outcome).toBe('not_receipt');
  });

  it('logs provider failures as ai_unavailable and rethrows 503', async () => {
    const { service, records } = setup({ extractError: receiptScanError('AI_UNAVAILABLE', 503) });
    await expect(scan(service)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', statusCode: 503 });
    expect(records[0].outcome).toBe('ai_unavailable');
  });

  it('answers 503 without a configured extractor', async () => {
    const service = new ReceiptScanService({
      extractor: null,
      repository: setup().repository,
      categories: { findAll: jest.fn() },
      accounts: { findByWorkspaceId: jest.fn() },
      freeScansPerMonth: 5,
    });
    expect(service.isAvailable).toBe(false);
    await expect(scan(service)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', statusCode: 503 });
  });
});

describe('ReceiptScanService.getUsage (quota)', () => {
  it('Free: 5 per calendar month (UTC), counting only successes', async () => {
    const { service, repository } = setup({ used: 4 });
    expect(await service.getUsage(WS)).toMatchObject({ used: 4, limit: 5 });
    expect(repository.countSuccessfulForOwnerSince).toHaveBeenCalledWith(
      'owner-1',
      new Date('2026-09-01T00:00:00Z'),
    );
  });

  it('paid plans (-1) are unlimited', async () => {
    const { service } = setup({
      allowance: { ...FREE, planName: 'Pro Monthly', snapshotLimit: -1, planLimit: -1 },
      used: 200,
    });
    expect(await service.getUsage(WS)).toMatchObject({ used: 200, limit: null });
  });

  it('falls back to the plan when the snapshot predates migration 032', async () => {
    const { service } = setup({
      allowance: { ...FREE, snapshotLimit: undefined, planLimit: 5 },
    });
    expect((await service.getUsage(WS)).limit).toBe(5);
  });

  it('no subscription row → the Free allowance', async () => {
    const { service } = setup({
      allowance: { ownerId: 'o', hasSubscription: false, planName: null, snapshotLimit: undefined, planLimit: undefined },
    });
    expect((await service.getUsage(WS)).limit).toBe(5);
  });

  it('a paid plan without the key stays unlimited', async () => {
    const { service } = setup({
      allowance: { ownerId: 'o', hasSubscription: true, planName: 'Business Monthly', snapshotLimit: undefined, planLimit: undefined },
    });
    expect((await service.getUsage(WS)).limit).toBeNull();
  });
});

describe('matchCategory', () => {
  it('matches case-insensitively, loosely, then by synonym', () => {
    expect(matchCategory('groceries', CATEGORIES)?.id).toBe('cat-groceries');
    expect(matchCategory('Food and Dining', CATEGORIES)?.id).toBe('cat-dining');
    expect(matchCategory('Fuel', CATEGORIES)?.id).toBe('cat-transport');
    expect(matchCategory('Pharmacy', CATEGORIES)?.id).toBe('cat-health');
    expect(matchCategory('Restaurants', CATEGORIES)?.id).toBe('cat-dining');
    expect(matchCategory('Spaceships', CATEGORIES)).toBeNull();
    expect(matchCategory(null, CATEGORIES)).toBeNull();
  });
});

describe('roundToMinor', () => {
  it('uses the currency minor units', () => {
    expect(roundToMinor(10.005, 'USD')).toBe(10.01);
    expect(roundToMinor(10.4, 'JPY')).toBe(10);
    expect(roundToMinor(1.2345, 'KWD')).toBe(1.235);
  });
});
