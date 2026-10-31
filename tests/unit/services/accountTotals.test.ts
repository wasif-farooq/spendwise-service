import { AccountService } from '@domains/accounts/services/AccountService';
import { openingBalanceTransactionType } from '@domains/accounts/models/Account';

const RATES: Record<string, number> = { 'USD>PKR': 280 };

const serviceWith = (accounts: { id: string; balance: number; currency: string }[]) =>
  new AccountService(
    { findAllWithBalancesForWorkspace: async () => accounts } as any,
    {
      convert: async (_amount: number, from: string, to: string) => {
        const rate = RATES[`${from}>${to}`];
        if (!rate) throw new Error('no rate');
        return { rate };
      },
    } as any,
  );

describe('AccountService.getTotalBalance', () => {
  it('converts each account before splitting money held from money owed', async () => {
    const result = await serviceWith([
      { id: 'bank', balance: 100000, currency: 'PKR' },
      { id: 'savings', balance: 1000, currency: 'USD' },
      { id: 'card', balance: -200, currency: 'USD' },
    ]).getTotalBalance('ws', 'PKR');

    expect(result).toEqual({
      total: 324000,
      assets: 380000,
      liabilities: -56000,
      currency: 'PKR',
      unconvertedCurrencies: [],
      convertedBalances: { bank: 100000, savings: 280000, card: -56000 },
    });
  });

  it('does not net a positive and a negative account in the same currency', async () => {
    const result = await serviceWith([
      { id: 'savings', balance: 500, currency: 'PKR' },
      { id: 'card', balance: -500, currency: 'PKR' },
    ]).getTotalBalance('ws', 'PKR');

    expect(result).toMatchObject({ total: 0, assets: 500, liabilities: -500 });
  });

  it('leaves an account with no rate out of every figure', async () => {
    const result = await serviceWith([
      { id: 'bank', balance: 100, currency: 'PKR' },
      { id: 'other', balance: -5, currency: 'EUR' },
    ]).getTotalBalance('ws', 'PKR');

    expect(result).toEqual({
      total: 100,
      assets: 100,
      liabilities: 0,
      currency: 'PKR',
      unconvertedCurrencies: ['EUR'],
      convertedBalances: { bank: 100 },
    });
  });

  it('keeps total equal to assets plus liabilities after rounding', async () => {
    const result = await serviceWith([
      { id: 'a', balance: 0.005, currency: 'USD' },
      { id: 'b', balance: 0.005, currency: 'USD' },
      { id: 'c', balance: -0.003, currency: 'USD' },
    ]).getTotalBalance('ws', 'PKR');

    expect(result.total).toBeCloseTo(result.assets + result.liabilities, 8);
  });

  it('is zero with no accounts', async () => {
    const result = await serviceWith([]).getTotalBalance('ws', 'PKR');

    expect(result).toMatchObject({ total: 0, assets: 0, liabilities: 0, convertedBalances: {} });
  });
});

describe('openingBalanceTransactionType', () => {
  it('treats a credit card opening amount as money owed', () => {
    expect(openingBalanceTransactionType('credit_card')).toBe('expense');
  });

  it.each(['bank', 'savings', 'cash', 'investment'])('treats %s as money held', (type) => {
    expect(openingBalanceTransactionType(type)).toBe('income');
  });
});
