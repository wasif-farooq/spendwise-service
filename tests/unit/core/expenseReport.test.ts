import { ExpenseReportGenerator } from '@domains/reports/services/ExpenseReportGenerator';
import { generateExpenseReportCsv } from '@domains/reports/services/CsvGenerator';
import { generateExpenseReportEmailText } from '@domains/email/EmailTemplates';

/**
 * The expense report converts every amount into the owner's Preferences
 * currency instead of adding EUR, USD and BTC as if they were one currency,
 * and leaves out (and lists) currencies with no rate.
 */

// 1 EUR = 1.10 USD; 1 BTC = 60000 USD; no rate for XYZ.
const RATES: Record<string, number> = { 'EUR>USD': 1.1, 'BTC>USD': 60000 };
const rateOf = async (from: string, to: string) => {
  const rate = RATES[`${from}>${to}`];
  if (!rate) throw new Error(`no rate ${from}>${to}`);
  return rate;
};

const expense = (description: string, amount: number, currency: string, categoryName: string) => ({
  type: 'expense',
  description,
  amount,
  currency,
  categoryName,
  date: '2026-09-15',
});

function fakeRepo(ownerCurrency: string | null = 'USD') {
  return {
    getWorkspaceOwnerCurrency: async () => ownerCurrency,
    getWorkspaceStatsByCurrency: async (_ws: string, start: string) =>
      start >= '2026-09-01'
        ? [
            { currency: 'BTC', totalIncome: 0, totalExpense: 0.001, transactionCount: 1 },
            { currency: 'EUR', totalIncome: 0, totalExpense: 100, transactionCount: 1 },
            { currency: 'USD', totalIncome: 500, totalExpense: 50, transactionCount: 2 },
            { currency: 'XYZ', totalIncome: 0, totalExpense: 999, transactionCount: 1 },
          ]
        : // Previous period: 100 USD of spending.
          [{ currency: 'USD', totalIncome: 0, totalExpense: 100, transactionCount: 1 }],
    getWorkspaceAccountStats: async () => [
      { accountId: 'a1', accountName: 'Euro Card', currency: 'EUR', totalIncome: 0, totalExpense: 100, balance: -100 },
      { accountId: 'a2', accountName: 'Checking', currency: 'USD', totalIncome: 500, totalExpense: 50, balance: 450 },
      { accountId: 'a3', accountName: 'Cold Wallet', currency: 'BTC', totalIncome: 0, totalExpense: 0.001, balance: -0.001 },
      { accountId: 'a4', accountName: 'Odd', currency: 'XYZ', totalIncome: 0, totalExpense: 999, balance: -999 },
    ],
    findByWorkspaceId: async () => ({
      transactions: [
        expense('Paris hotel', 100, 'EUR', 'Travel'),
        expense('Groceries', 50, 'USD', 'Food'),
        expense('Hardware', 0.001, 'BTC', 'Tech'),
        expense('Mystery', 999, 'XYZ', 'Other'),
        { type: 'income', description: 'Salary', amount: 500, currency: 'USD', date: '2026-09-01' },
      ],
    }),
  };
}

const generate = (repo = fakeRepo()) =>
  new ExpenseReportGenerator(repo as any, {} as any, rateOf).generate('ws1', 'custom', {
    startDate: '2026-09-01',
    endDate: '2026-09-30',
  });

describe('expense report currency conversion', () => {
  it('converts every currency into the owner currency for the total', async () => {
    const report = await generate();

    // 100 EUR = 110 USD, 50 USD, 0.001 BTC = 60 USD; XYZ has no rate.
    expect(report.currency).toBe('USD');
    expect(report.summary.totalExpenses).toBe(220);
    expect(report.unconvertedCurrencies).toEqual(['XYZ']);
  });

  it('converts the category, merchant and account breakdowns', async () => {
    const report = await generate();

    expect(report.byCategory.map((c) => [c.category, c.amount])).toEqual([
      ['Travel', 110],
      ['Tech', 60],
      ['Food', 50],
    ]);
    expect(report.byCategory[0].percentage).toBeCloseTo(50);
    expect(report.byMerchant[0]).toEqual({ merchant: 'Paris hotel', amount: 110, count: 1 });
    expect(report.byAccount).toEqual([
      { accountName: 'Euro Card', amount: 110 },
      { accountName: 'Cold Wallet', amount: 60 },
      { accountName: 'Checking', amount: 50 },
    ]);
  });

  it('ranks the largest expenses by converted value but keeps their own currency', async () => {
    const report = await generate();

    expect(report.topExpenses.map((t) => [t.description, t.amount, t.currency])).toEqual([
      ['Paris hotel', 100, 'EUR'],
      ['Hardware', 0.001, 'BTC'],
      ['Groceries', 50, 'USD'],
    ]);
  });

  it('averages over converted expenses and compares with the converted previous period', async () => {
    const report = await generate();

    expect(report.summary.averageTransaction).toBeCloseTo(73.33, 2);
    expect(report.summary.previousPeriodChange).toBeCloseTo(120);
  });

  it("uses the owner's currency, and USD when none is set", async () => {
    const eurRates = { ...RATES, 'USD>EUR': 1 / 1.1 };
    const eur = await new ExpenseReportGenerator(
      fakeRepo('eur') as any,
      {} as any,
      async (from, to) => {
        const rate = eurRates[`${from}>${to}` as keyof typeof eurRates];
        if (!rate) throw new Error('no rate');
        return rate;
      },
    ).generate('ws1', 'custom', { startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(eur.currency).toBe('EUR');
    // BTC has no direct BTC>EUR rate here, so it is left out like XYZ.
    expect(eur.summary.totalExpenses).toBeCloseTo(145.45, 2);
    expect(eur.unconvertedCurrencies).toEqual(['BTC', 'XYZ']);

    expect((await generate(fakeRepo(null))).currency).toBe('USD');
  });

  it('labels the currency in the CSV and the email', async () => {
    const report = await generate();

    const csv = generateExpenseReportCsv(report).toString('utf-8');
    expect(csv).toContain('Currency,USD');
    expect(csv).toContain('Not included (no exchange rate),XYZ');
    expect(csv).toContain('Paris hotel,100.00,EUR,');
    expect(csv).toContain('Hardware,0.00100000,BTC,');

    const text = generateExpenseReportEmailText({ ...report, currency: 'EUR' });
    expect(text).toContain('Total expenses: €220.00');
    expect(text).toContain('Amounts in EUR. Not included (no exchange rate): XYZ.');
  });
});
