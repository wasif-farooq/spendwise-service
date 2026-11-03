import {
  AccountAccess,
  CREATOR_ACCOUNT_PERMISSIONS,
  grantCreatorAccess,
  resolveAccountAccess,
} from '@domains/workspaces/services/AccountAccess';
import { AccountService } from '@domains/accounts/services/AccountService';
import { Account } from '@domains/accounts/models/Account';
import { TransactionService } from '@domains/transactions/services/TransactionService';
import { Transaction } from '@domains/transactions/models/Transaction';
import { ExpenseReportGenerator } from '@domains/reports/services/ExpenseReportGenerator';
import { AnalyticsService } from '@domains/analytics/services/AnalyticsService';

/**
 * Per-account access for workspace members: owner/`*` roles see everything,
 * everyone else only the accounts they have a row for, and inside those only the
 * actions the row (or, for an empty row, the role) allows. Denied always wins.
 */

const VIEWER_ROLE = [
  'accounts:view',
  'transactions:view',
  'transactions:create',
  'transactions:edit',
];

// What the member form stores: View only → ['view'], Can edit → ['view','create','edit'].
const VIEW = { permissions: ['view'], denied: [] as string[] };
const EDIT = { permissions: ['view', 'create', 'edit'], denied: [] as string[] };

const member = (
  rows: Record<string, { permissions: string[]; denied: string[] }>,
  role = VIEWER_ROLE,
) => AccountAccess.restricted('member-1', role, rows);

describe('AccountAccess', () => {
  it('owner and admin (`*`) are unrestricted without any rows', () => {
    const access = AccountAccess.unrestricted();
    expect(access.canSee('any')).toBe(true);
    expect(access.can('any', 'transactions:delete')).toBe(true);
    expect(access.accountIdsWith('transactions:view')).toBeUndefined();
    expect(() => access.assert('any', 'accounts:delete')).not.toThrow();
  });

  it('a member with no rows sees no accounts (deny by default)', () => {
    const access = member({});
    expect(access.canSee('a1')).toBe(false);
    expect(access.accountIdsWith('accounts:view')).toEqual([]);
    expect(access.accountIdsWith('transactions:view')).toEqual([]);
    expect(() => access.assert('a1', 'accounts:view')).toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it('a view row allows reading but not creating or editing', () => {
    const access = member({ a1: VIEW });
    expect(access.can('a1', 'accounts:view')).toBe(true);
    expect(access.can('a1', 'transactions:view')).toBe(true);
    expect(access.can('a1', 'transactions:create')).toBe(false);
    expect(access.can('a1', 'transactions:edit')).toBe(false);
    // Visible, so a forbidden action is 403 (not 404).
    expect(() => access.assert('a1', 'transactions:create')).toThrow(
      expect.objectContaining({ statusCode: 403 }),
    );
  });

  it('an edit row allows view, create and edit (but not delete)', () => {
    const access = member({ a1: EDIT });
    expect(access.can('a1', 'transactions:create')).toBe(true);
    expect(access.can('a1', 'transactions:edit')).toBe(true);
    expect(access.can('a1', 'accounts:edit')).toBe(true);
    expect(access.can('a1', 'transactions:delete')).toBe(false);
  });

  it('a "Per role" row (empty permissions) falls back to the role', () => {
    const access = member({ a1: { permissions: [], denied: [] } });
    expect(access.can('a1', 'transactions:create')).toBe(true);
    expect(access.can('a1', 'transactions:delete')).toBe(false);
  });

  it('accepts full permission names copied from a role', () => {
    const access = member({
      a1: { permissions: ['accounts:view', 'transactions:view'], denied: [] },
    });
    expect(access.can('a1', 'transactions:view')).toBe(true);
    expect(access.can('a1', 'transactions:create')).toBe(false);
  });

  it('denied wins over the row and the role', () => {
    const access = member({
      a1: { permissions: ['view', 'create', 'edit'], denied: ['transactions:edit'] },
      a2: { permissions: [], denied: ['create'] },
      a3: { permissions: ['view'], denied: ['accounts:view'] },
    });
    expect(access.can('a1', 'transactions:edit')).toBe(false);
    expect(access.can('a1', 'transactions:create')).toBe(true);
    expect(access.can('a2', 'transactions:create')).toBe(false);
    // Denying accounts:view hides the account altogether.
    expect(access.canSee('a3')).toBe(false);
    expect(access.accountIdsWith('accounts:view')).toEqual(['a1', 'a2']);
  });

  it('accountIdsWith lists only the accounts allowing that action', () => {
    const access = member({ a1: VIEW, a2: EDIT });
    expect(access.accountIdsWith('transactions:view')).toEqual(['a1', 'a2']);
    expect(access.accountIdsWith('transactions:create')).toEqual(['a2']);
  });
});

describe('resolveAccountAccess', () => {
  const db = (opts: {
    owner: string;
    member?: { id: string; roleIds: string[] };
    roles?: string[][];
    rows?: any[];
  }) => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM workspaces w')) {
        return {
          rows: [
            {
              owner_id: opts.owner,
              member_id: opts.member?.id ?? null,
              role_ids: opts.member?.roleIds ?? null,
            },
          ],
        };
      }
      if (sql.includes('FROM workspace_roles')) {
        return { rows: (opts.roles ?? []).map((permissions) => ({ permissions })) };
      }
      if (sql.includes('workspace_member_account_permissions')) return { rows: opts.rows ?? [] };
      throw new Error(`unexpected ${sql}`);
    });
    return { query } as any;
  };

  it('the owner is unrestricted', async () => {
    const access = await resolveAccountAccess(
      db({ owner: 'u1', member: { id: 'm1', roleIds: [] } }),
      'u1',
      'ws',
    );
    expect(access.unrestricted).toBe(true);
  });

  it('a member whose role grants `*` (Admin) is unrestricted', async () => {
    const access = await resolveAccountAccess(
      db({ owner: 'owner', member: { id: 'm1', roleIds: ['r1'] }, roles: [['*']] }),
      'u1',
      'ws',
    );
    expect(access.unrestricted).toBe(true);
  });

  it('anyone else gets exactly their rows, on any plan', async () => {
    const access = await resolveAccountAccess(
      db({
        owner: 'owner',
        member: { id: 'm1', roleIds: ['r1'] },
        roles: [VIEWER_ROLE],
        rows: [{ account_id: 'a1', permissions: ['view'], denied_permissions: [] }],
      }),
      'u1',
      'ws',
    );
    expect(access.unrestricted).toBe(false);
    expect(access.memberId).toBe('m1');
    expect(access.accountIdsWith('accounts:view')).toEqual(['a1']);
  });

  it('a non-member sees nothing', async () => {
    const access = await resolveAccountAccess(db({ owner: 'owner' }), 'stranger', 'ws');
    expect(access.unrestricted).toBe(false);
    expect(access.memberId).toBeNull();
    expect(access.accountIdsWith('accounts:view')).toEqual([]);
  });
});

describe('creator auto-grant', () => {
  it('gives a restricted creator full rights on the new account', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    await grantCreatorAccess({ query } as any, member({}), 'new-account');
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as unknown as [string, any[]];
    expect(sql).toContain('INSERT INTO workspace_member_account_permissions');
    expect(params).toEqual(['member-1', 'new-account', CREATOR_ACCOUNT_PERMISSIONS]);

    // ...so the account is then fully usable with that row.
    const after = member({
      'new-account': { permissions: CREATOR_ACCOUNT_PERMISSIONS, denied: [] },
    });
    for (const p of CREATOR_ACCOUNT_PERMISSIONS) expect(after.can('new-account', p)).toBe(true);
  });

  it('is a no-op for unrestricted users', async () => {
    const query = jest.fn();
    await grantCreatorAccess({ query } as any, AccountAccess.unrestricted('m1'), 'a');
    await grantCreatorAccess({ query } as any, undefined, 'a');
    expect(query).not.toHaveBeenCalled();
  });
});

// ---------- services over in-memory data ----------

const ACCOUNTS = [
  { id: 'a1', currency: 'USD', balance: 100 },
  { id: 'a2', currency: 'USD', balance: 1000 },
];

const account = (id: string) =>
  Account.restore(
    {
      name: id,
      type: 'checking',
      balance: 0,
      currency: 'USD',
      workspaceId: 'ws',
      userId: 'owner',
      lastActivity: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      totalIncome: 0,
      totalExpense: 0,
    } as any,
    id,
  );

const accountRepo = () => {
  const pick = (ids?: string[]) => ACCOUNTS.filter((a) => !ids || ids.includes(a.id));
  return {
    findById: jest.fn(async (id: string) =>
      ACCOUNTS.some((a) => a.id === id) ? account(id) : null,
    ),
    findByWorkspaceId: jest.fn(async (_ws: string, ids?: string[]) =>
      pick(ids).map((a) => account(a.id)),
    ),
    findAllWithBalancesForWorkspace: jest.fn(async (_ws: string, ids?: string[]) =>
      pick(ids).map((a) => ({ ...a, name: a.id })),
    ),
    update: jest.fn(async (a: any) => a),
    delete: jest.fn(),
    withDb() {
      return this;
    },
    updateBalance: jest.fn(),
    updateIncomeExpense: jest.fn(),
  };
};

describe('AccountService with account access', () => {
  it('a member with no rows lists nothing and gets 404 for a direct fetch', async () => {
    const repo = accountRepo();
    const service = new AccountService(repo as any);
    expect(await service.getAccountsByWorkspace('ws', member({}))).toEqual([]);
    await expect(service.getAccountById('a1', 'ws', member({}))).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('the owner lists every account', async () => {
    const service = new AccountService(accountRepo() as any);
    const all = await service.getAccountsByWorkspace('ws', AccountAccess.unrestricted());
    expect(all.map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('net worth only counts accessible accounts', async () => {
    const service = new AccountService(accountRepo() as any);
    const totals = await service.getTotalBalance('ws', 'USD', member({ a1: VIEW }));
    expect(totals.total).toBe(100);
    expect(Object.keys(totals.convertedBalances)).toEqual(['a1']);
  });

  it('a view row cannot edit or delete the account', async () => {
    const service = new AccountService(accountRepo() as any);
    await expect(
      service.updateAccount('a1', { name: 'x' }, 'ws', 'u', member({ a1: VIEW })),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      service.deleteAccount('a1', 'ws', 'u', member({ a1: VIEW })),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('TransactionService with account access', () => {
  const tx = (id: string, accountId: string) =>
    Transaction.restore(
      {
        accountId,
        userId: 'owner',
        workspaceId: 'ws',
        type: 'expense',
        amount: 10,
        currency: 'USD',
        date: new Date('2026-10-01'),
        linkedTransactionIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
      id,
    );
  const TXS = [tx('t1', 'a1'), tx('t2', 'a2')];

  const build = () => {
    const transactionRepo: any = {
      findById: jest.fn(async (id: string) => TXS.find((t) => t.id === id) ?? null),
      findByIdWithDetails: jest.fn(async (id: string) => {
        const t = TXS.find((x) => x.id === id);
        return t ? { ...t.toJSON(), workspaceId: 'ws', linkedTransactions: [] } : null;
      }),
      findByWorkspaceId: jest.fn(async (_ws: string, options: any) => {
        const rows = TXS.filter(
          (t) => !options.accountIds || options.accountIds.includes(t.accountId),
        );
        return { transactions: rows, total: rows.length };
      }),
      findByWorkspaceIdCursor: jest.fn(async (_ws: string, _o: any, filters: any) => ({
        data: TXS.filter((t) => !filters?.accountIds || filters.accountIds.includes(t.accountId)),
        pagination: { nextCursor: null, hasMore: false },
      })),
      getWorkspaceStatsByCurrency: jest.fn(
        async (_ws: string, _s: any, _e: any, ids?: string[]) => [
          {
            currency: 'USD',
            totalIncome: 0,
            totalExpense: TXS.filter((t) => !ids || ids.includes(t.accountId)).length * 10,
            transactionCount: TXS.filter((t) => !ids || ids.includes(t.accountId)).length,
          },
        ],
      ),
      save: jest.fn(async (t: any) => t),
      update: jest.fn(async (t: any) => t),
      delete: jest.fn(),
      getAccountStats: jest.fn(async () => ({ balance: 1000, totalIncome: 0, totalExpense: 0 })),
      invalidateAccountStatsCache: jest.fn(),
      withDb() {
        return this;
      },
    };
    const db: any = {
      transaction: (cb: any) => cb(db),
      query: jest.fn(async () => ({ rows: [] })),
    };
    return {
      service: new TransactionService(transactionRepo, accountRepo() as any, db),
      transactionRepo,
    };
  };

  it('a member with no rows lists nothing and gets 404 for a transaction', async () => {
    const { service } = build();
    const list = await service.getTransactionsByWorkspace('ws', {}, member({}));
    expect(list.transactions).toEqual([]);
    const cursor = await service.getTransactionsByWorkspaceCursor(
      'ws',
      { limit: 50 },
      {},
      member({}),
    );
    expect(cursor.data).toEqual([]);
    await expect(service.getTransactionWithDetails('t1', 'ws', member({}))).rejects.toMatchObject({
      statusCode: 404,
      message: 'Transaction not found',
    });
  });

  it('a view row lists and reads but cannot create, edit or delete there', async () => {
    const { service, transactionRepo } = build();
    const access = member({ a1: VIEW });
    const list = await service.getTransactionsByWorkspace('ws', {}, access);
    expect(list.transactions.map((t: any) => t.id)).toEqual(['t1']);
    await expect(service.getTransactionWithDetails('t1', 'ws', access)).resolves.toBeTruthy();
    await expect(service.getTransactionWithDetails('t2', 'ws', access)).rejects.toMatchObject({
      statusCode: 404,
    });

    await expect(
      service.createTransaction(
        { accountId: 'a1', type: 'expense', amount: 5, currency: 'USD', date: '2026-10-02' },
        'u',
        'ws',
        access,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.updateTransaction('t1', { amount: 1 }, 'ws', 'u', access),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(service.deleteTransaction('t1', 'ws', 'u', access)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(transactionRepo.save).not.toHaveBeenCalled();
    expect(transactionRepo.update).not.toHaveBeenCalled();
    expect(transactionRepo.delete).not.toHaveBeenCalled();
  });

  it('an edit row allows creating and editing', async () => {
    const { service, transactionRepo } = build();
    const access = member({ a1: EDIT });
    await service.createTransaction(
      { accountId: 'a1', type: 'expense', amount: 5, currency: 'USD', date: '2026-10-02' },
      'u',
      'ws',
      access,
    );
    await service.updateTransaction('t1', { amount: 1 }, 'ws', 'u', access);
    expect(transactionRepo.save).toHaveBeenCalledTimes(1);
    expect(transactionRepo.update).toHaveBeenCalledTimes(1);
  });

  it('a transaction in an inaccessible account is 404 even through an accessible path', async () => {
    const { service } = build();
    await expect(
      service.updateTransaction('t2', { amount: 1 }, 'ws', 'u', member({ a1: EDIT })),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Transaction not found',
    });
  });

  it('moving a transaction needs rights on both accounts', async () => {
    const { service } = build();
    await expect(
      service.updateTransaction(
        't1',
        { accountId: 'a2' },
        'ws',
        'u',
        member({ a1: EDIT, a2: VIEW }),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.updateTransaction('t1', { accountId: 'a2' }, 'ws', 'u', member({ a1: EDIT })),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('a transfer between an allowed and a forbidden account is rejected', async () => {
    const { service, transactionRepo } = build();
    const data = {
      fromAccountId: 'a1',
      toAccountId: 'a2',
      amount: 5,
      currency: 'USD',
      date: '2026-10-02',
    };
    await expect(service.transfer(data, 'u', 'ws', member({ a1: EDIT }))).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      service.transfer(
        { ...data, fromAccountId: 'a2', toAccountId: 'a1' },
        'u',
        'ws',
        member({ a1: EDIT, a2: VIEW }),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(transactionRepo.save).not.toHaveBeenCalled();
  });

  it('workspace totals only include accessible accounts', async () => {
    const { service } = build();
    const all = await service.getWorkspaceStats(
      'ws',
      undefined,
      undefined,
      'USD',
      AccountAccess.unrestricted(),
    );
    const mine = await service.getWorkspaceStats(
      'ws',
      undefined,
      undefined,
      'USD',
      member({ a1: VIEW }),
    );
    expect(all.totalExpense).toBe(20);
    expect(mine.totalExpense).toBe(10);
    expect(mine.transactionCount).toBe(1);
  });
});

describe('reports and analytics exclude forbidden accounts', () => {
  it('the expense report only covers the given accounts', async () => {
    const rows = [
      {
        accountId: 'a1',
        accountName: 'Mine',
        currency: 'USD',
        totalIncome: 0,
        totalExpense: 30,
        balance: -30,
      },
      {
        accountId: 'a2',
        accountName: 'Secret',
        currency: 'USD',
        totalIncome: 0,
        totalExpense: 700,
        balance: -700,
      },
    ];
    const txs = [
      {
        type: 'expense',
        accountId: 'a1',
        description: 'Lunch',
        amount: 30,
        currency: 'USD',
        date: '2026-10-01',
      },
      {
        type: 'expense',
        accountId: 'a2',
        description: 'Secret',
        amount: 700,
        currency: 'USD',
        date: '2026-10-01',
      },
    ];
    const within = (ids?: string[]) => (r: { accountId: string }) =>
      !ids || ids.includes(r.accountId);
    const repo = {
      getWorkspaceOwnerCurrency: async () => 'USD',
      getWorkspaceStatsByCurrency: async (_ws: string, _s: string, _e: string, ids?: string[]) => [
        {
          currency: 'USD',
          totalIncome: 0,
          totalExpense: txs.filter(within(ids)).reduce((sum, t) => sum + t.amount, 0),
          transactionCount: txs.filter(within(ids)).length,
        },
      ],
      getWorkspaceAccountStats: async (_ws: string, _s: string, _e: string, ids?: string[]) =>
        rows.filter(within(ids)),
      findByWorkspaceId: async (_ws: string, options: any) => ({
        transactions: txs.filter(within(options.accountIds)),
      }),
    };
    const report = await new ExpenseReportGenerator(repo as any, {} as any).generate(
      'ws',
      'custom',
      { startDate: '2026-10-01', endDate: '2026-10-31' },
      ['a1'],
    );
    expect(report.summary.totalExpenses).toBe(30);
    expect(report.byAccount.map((a) => a.accountName)).toEqual(['Mine']);
    expect(report.byMerchant.map((m) => m.merchant)).toEqual(['Lunch']);
    expect(JSON.stringify(report)).not.toContain('Secret');
  });

  it('analytics restrict every query to the given accounts, even when there are none', async () => {
    const queries: Array<{ sql: string; params: any[] }> = [];
    const db = {
      query: jest.fn(async (sql: string, params: any[]) => {
        queries.push({ sql, params });
        return { rows: [] };
      }),
    };
    const analytics = new AnalyticsService(
      db as any,
      {} as any,
      {} as any,
      { convert: async () => ({ rate: 1 }) } as any,
    );
    await analytics.getOverview('ws', 'month', { accounts: [], preferredCurrency: 'USD' });
    const dataQueries = queries.filter((q) => /FROM (transactions|accounts)/.test(q.sql));
    expect(dataQueries.length).toBeGreaterThanOrEqual(4);
    for (const q of dataQueries) {
      expect(q.sql).toMatch(/(account_id|id) = ANY\(\$\d+/);
      expect(q.params).toContainEqual([]);
    }
  });
});
