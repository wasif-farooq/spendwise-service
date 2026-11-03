import { Account, openingBalanceTransaction } from '@domains/accounts/models/Account';
import { AccountValidators } from '@domains/accounts/validators';
import { AccountService } from '@domains/accounts/services/AccountService';

/**
 * POST /accounts with an opening amount: the user picks whether it counts as income or
 * expense (`openingBalanceType`), falling back to the per-type default when omitted.
 */

const mockCreateTransaction = jest.fn();
const mockCreateAccountWithRepo = jest.fn();

jest.mock('@config/ConfigLoader', () => ({
  ConfigLoader: { getInstance: () => ({ get: () => undefined }) },
}));

jest.mock('@di/Container', () => ({
  Container: {
    getInstance: () => ({
      resolve: () => ({ transaction: (fn: (trx: unknown) => unknown) => fn({ trx: true }) }),
    }),
  },
}));

jest.mock('@factories/RepositoryFactory', () => ({
  RepositoryFactory: jest.fn().mockImplementation(() => ({
    createAccountRepository: () => ({ withDb: () => ({}) }),
  })),
}));

jest.mock('@factories/ServiceFactory', () => ({
  ServiceFactory: jest.fn().mockImplementation(() => ({
    createAccountService: () => ({ createAccountWithRepo: mockCreateAccountWithRepo }),
  })),
}));

jest.mock('@domains/workspaces/services/AccountAccess', () => ({
  grantCreatorAccess: jest.fn(),
}));

jest.mock('@domains/transactions/services/TransactionService', () => ({
  TransactionService: jest.fn().mockImplementation(() => ({
    createTransaction: mockCreateTransaction,
  })),
}));

jest.mock('@domains/transactions/repositories/TransactionRepository', () => ({
  TransactionRepository: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AccountRequestRepository } = require('@domains/accounts/repositories/AccountRequestRepository');

const create = (body: Record<string, unknown>) =>
  new AccountRequestRepository().createWithOpeningBalance(
    'ws',
    'user',
    AccountValidators.validateCreate({ name: 'Acc', currency: 'USD', ...body }),
  );

/** The account's balance once its opening transaction has been booked (income − expense). */
const balanceAfter = (type: 'income' | 'expense', amount: number) => {
  const account = Account.create({
    name: 'Acc',
    type: 'bank',
    balance: amount,
    currency: 'USD',
    workspaceId: 'ws',
    userId: 'user',
  });
  account.updateIncomeExpense(type === 'income' ? amount : 0, type === 'expense' ? amount : 0);
  return account.balance;
};

const totalsFor = (balance: number) =>
  new AccountService(
    {
      findAllWithBalancesForWorkspace: async () => [{ id: 'a', balance, currency: 'USD' }],
    } as any,
    { convert: async () => ({ rate: 1 }) } as any,
  ).getTotalBalance('ws', 'USD');

beforeEach(() => {
  mockCreateTransaction.mockReset();
  mockCreateAccountWithRepo.mockReset().mockImplementation(async (data) => ({ id: 'acc-1', ...data }));
});

describe('openingBalanceTransaction', () => {
  it('defaults by account type when no choice is made', () => {
    expect(openingBalanceTransaction('credit_card', 50)).toEqual({ type: 'expense', amount: 50 });
    expect(openingBalanceTransaction('bank', 50)).toEqual({ type: 'income', amount: 50 });
  });

  it('uses the explicit choice over the default', () => {
    expect(openingBalanceTransaction('credit_card', 50, 'income')).toEqual({
      type: 'income',
      amount: 50,
    });
    expect(openingBalanceTransaction('bank', 50, 'expense')).toEqual({
      type: 'expense',
      amount: 50,
    });
  });

  it('records nothing for a zero opening amount, whatever the choice', () => {
    expect(openingBalanceTransaction('bank', 0, 'expense')).toBeNull();
    expect(openingBalanceTransaction('bank', undefined)).toBeNull();
  });
});

describe('CreateAccountSchema openingBalanceType', () => {
  it('accepts income and expense, and leaves it out when omitted', () => {
    const base = { name: 'Acc', type: 'bank', balance: 10, currency: 'USD' };
    expect(AccountValidators.validateCreate({ ...base, openingBalanceType: 'income' })).toMatchObject({
      openingBalanceType: 'income',
    });
    expect(AccountValidators.validateCreate({ ...base, openingBalanceType: 'expense' })).toMatchObject(
      { openingBalanceType: 'expense' },
    );
    expect(AccountValidators.validateCreate(base)).not.toHaveProperty('openingBalanceType');
  });

  it.each(['transfer', 'INCOME', '', 1, null])('rejects %p with a 400', (value) => {
    expect.assertions(2);
    try {
      AccountValidators.validateCreate({
        name: 'Acc',
        type: 'bank',
        balance: 10,
        currency: 'USD',
        openingBalanceType: value,
      });
    } catch (error: any) {
      expect(error.statusCode).toBe(400);
      expect(error.message).toMatch(/Opening balance type|Expected/);
    }
  });
});

describe('AccountRequestRepository.createWithOpeningBalance', () => {
  const openingType = () => mockCreateTransaction.mock.calls[0][0].type;

  it.each([
    ['credit_card', 'expense'],
    ['bank', 'income'],
    ['savings', 'income'],
    ['cash', 'income'],
    ['investment', 'income'],
  ])('defaults a %s opening amount to %s', async (type, expected) => {
    const result = await create({ type, balance: 100 });

    expect(result.error).toBeNull();
    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreateTransaction.mock.calls[0][0]).toMatchObject({
      accountId: 'acc-1',
      type: expected,
      amount: 100,
      currency: 'USD',
      description: 'Opening Balance',
    });
  });

  it('records an explicit income opening on a credit card', async () => {
    await create({ type: 'credit_card', balance: 100, openingBalanceType: 'income' });
    expect(openingType()).toBe('income');
  });

  it('records an explicit expense opening on a bank account', async () => {
    await create({ type: 'bank', balance: 100, openingBalanceType: 'expense' });
    expect(openingType()).toBe('expense');
  });

  it('writes no opening transaction for a zero balance, even with a type', async () => {
    await create({ type: 'bank', balance: 0, openingBalanceType: 'expense' });
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockCreateAccountWithRepo).toHaveBeenCalledTimes(1);
  });

  it('does not pass openingBalanceType on to the account itself', async () => {
    await create({ type: 'bank', balance: 100, openingBalanceType: 'expense' });
    expect(mockCreateAccountWithRepo.mock.calls[0][0]).not.toHaveProperty('openingBalanceType');
  });
});

describe('resulting account balance', () => {
  it('is positive for an income opening and negative for an expense opening', () => {
    expect(balanceAfter('income', 100)).toBe(100);
    expect(balanceAfter('expense', 100)).toBe(-100);
  });

  it('shows a credit card with an expense opening as a liability', async () => {
    expect(await totalsFor(balanceAfter('expense', 100))).toMatchObject({
      assets: 0,
      liabilities: -100,
      total: -100,
    });
  });

  it('shows a credit card with an income opening as an asset', async () => {
    expect(await totalsFor(balanceAfter('income', 100))).toMatchObject({
      assets: 100,
      liabilities: 0,
      total: 100,
    });
  });
});
