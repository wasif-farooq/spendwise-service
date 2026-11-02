import { Request, Response } from 'express';
import {
  FREE_TRANSACTIONS_PER_MONTH,
  SqlTransactionLimitRepository,
  TransactionLimitError,
  TransactionLimitRepository,
  TransactionLimitService,
  TransactionOwnerPlan,
  planDisplayName,
} from '@domains/transactions/services/TransactionLimit';
import { TransactionController } from '@domains/transactions/controllers/TransactionController';
import { SubscriptionController } from '@domains/subscription/controllers/SubscriptionController';
import { readFileSync } from 'fs';

// Hoisted above the imports by ts-jest.

jest.mock('@domains/workspaces/services/AccountAccess', () => ({
  accountAccessFor: jest.fn(async () => ({ assert: jest.fn() })),
}));

const WS = '33333333-3333-4333-8333-333333333333';
const OTHER_WS = '44444444-4444-4444-8444-444444444444';
const OWNER = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-15T10:00:00Z');

interface Row {
  workspaceId: string;
  source: 'manual' | 'sync' | 'adjustment';
  createdAt: Date;
  /** The transaction's own date: never looked at. */
  date: Date;
}

/** In-memory stand-in applying the same predicate as the SQL (workspace, source, created_at). */
class FakeRepo implements TransactionLimitRepository {
  rows: Row[] = [];
  plan: TransactionOwnerPlan | null = {
    ownerId: OWNER,
    hasSubscription: true,
    planName: 'Free',
    limits: { transactions: 300 },
  };

  async findOwnerPlan() {
    return this.plan;
  }

  async countAddedSince(workspaceId: string, since: Date) {
    return this.rows.filter(
      (r) => r.workspaceId === workspaceId && r.source === 'manual' && r.createdAt >= since,
    ).length;
  }

  add(n: number, row: Partial<Row> = {}) {
    for (let i = 0; i < n; i += 1) {
      this.rows.push({
        workspaceId: WS,
        source: 'manual',
        createdAt: new Date('2026-11-02T08:00:00Z'),
        date: new Date('2026-11-02T08:00:00Z'),
        ...row,
      });
    }
  }
}

const setup = () => {
  const repo = new FakeRepo();
  const service = new TransactionLimitService(repo, () => NOW);
  return { repo, service };
};

const expectLimitError = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (e) => e,
  );
  expect(error).toBeInstanceOf(TransactionLimitError);
  return error as TransactionLimitError;
};

describe('TransactionLimitService', () => {
  it('lets a Free workspace under the limit add a transaction', async () => {
    const { repo, service } = setup();
    repo.add(299);
    await expect(service.assertCanAdd(WS, 1)).resolves.toBeUndefined();
  });

  it('refuses at the limit with 402 TRANSACTION_LIMIT_REACHED, limit, used and resetsAt', async () => {
    const { repo, service } = setup();
    repo.add(300);
    const error = await expectLimitError(service.assertCanAdd(WS, 1));
    expect(error.statusCode).toBe(402);
    expect(error.code).toBe('TRANSACTION_LIMIT_REACHED');
    expect(error.message).toBe(
      "You've added 300 transactions this month, the limit on the Free plan. Upgrade to add more.",
    );
    expect(error.extra).toEqual({
      feature: 'transactions',
      limit: 300,
      used: 300,
      resetsAt: '2026-12-01T00:00:00.000Z',
    });
  });

  it('uses the Starter limit and names the plan without the billing period', async () => {
    const { repo, service } = setup();
    repo.plan = {
      ownerId: OWNER,
      hasSubscription: true,
      planName: 'Starter Monthly',
      limits: { transactions: 1000 },
    };
    repo.add(999);
    await expect(service.assertCanAdd(WS)).resolves.toBeUndefined();
    repo.add(1);
    const error = await expectLimitError(service.assertCanAdd(WS));
    expect(error.message).toContain("You've added 1,000 transactions this month");
    expect(error.message).toContain('the limit on the Starter plan');
  });

  it('never limits Pro (-1)', async () => {
    const { repo, service } = setup();
    repo.plan = {
      ownerId: OWNER,
      hasSubscription: true,
      planName: 'Pro Monthly',
      limits: { transactions: -1 },
    };
    repo.add(5000);
    await expect(service.assertCanAdd(WS, 2)).resolves.toBeUndefined();
    await expect(service.getUsage(WS)).resolves.toMatchObject({ used: 5000, limit: null });
  });

  it('applies the Free allowance when the owner has no subscription', async () => {
    const { repo, service } = setup();
    repo.plan = { ownerId: OWNER, hasSubscription: false, planName: null, limits: {} };
    repo.add(FREE_TRANSACTIONS_PER_MONTH);
    await expectLimitError(service.assertCanAdd(WS));
  });

  it("doesn't count last month's rows (calendar month, UTC)", async () => {
    const { repo, service } = setup();
    repo.add(300, { createdAt: new Date('2026-10-31T23:59:59Z') });
    repo.add(10, { createdAt: new Date('2026-11-01T00:00:00Z') });
    await expect(service.getUsage(WS)).resolves.toMatchObject({ used: 10, limit: 300 });
    await expect(service.assertCanAdd(WS)).resolves.toBeUndefined();
  });

  it('counts a back-dated transaction by when it was added, not its date', async () => {
    const { repo, service } = setup();
    repo.add(300, { date: new Date('2025-01-01T00:00:00Z') });
    await expectLimitError(service.assertCanAdd(WS));
  });

  it('counts a transfer as the two rows it writes', async () => {
    const { repo, service } = setup();
    repo.add(298);
    await expect(service.assertCanAdd(WS, 2)).resolves.toBeUndefined();
    repo.add(1);
    const error = await expectLimitError(service.assertCanAdd(WS, 2));
    expect(error.message).toContain('A transfer adds 2 transactions and you have 1 left');
    expect(error.extra).toMatchObject({ limit: 300, used: 299 });
  });

  it("doesn't count synced rows or drift adjustments", async () => {
    const { repo, service } = setup();
    repo.add(1000, { source: 'sync' });
    repo.add(50, { source: 'adjustment' });
    repo.add(5);
    await expect(service.getUsage(WS)).resolves.toMatchObject({ used: 5 });
    await expect(service.assertCanAdd(WS)).resolves.toBeUndefined();
  });

  it('is only checked by the API routes people use, never by connected-account sync', () => {
    const sync = readFileSync('src/domains/connections/services/ConnectionSyncService.ts', 'utf8');
    expect(sync).not.toMatch(/TransactionLimit|assertCanAdd/);
  });

  it('counts per workspace', async () => {
    const { repo, service } = setup();
    repo.add(300, { workspaceId: OTHER_WS });
    await expect(service.assertCanAdd(WS)).resolves.toBeUndefined();
  });

  it('planDisplayName strips the billing period', () => {
    expect(planDisplayName('Business Yearly')).toBe('Business');
    expect(planDisplayName(null)).toBe('Free');
  });
});

describe('SqlTransactionLimitRepository', () => {
  it('counts manual rows of the workspace by created_at', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ count: 7 }] });
    const repo = new SqlTransactionLimitRepository({ query });
    const since = new Date('2026-11-01T00:00:00Z');
    await expect(repo.countAddedSince(WS, since)).resolves.toBe(7);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/source = 'manual'/);
    expect(sql).toMatch(/created_at >= \$2/);
    expect(sql).not.toMatch(/\bdate\b\s*>=/);
    expect(params).toEqual([WS, since]);
  });

  it("reads the owner's subscription snapshot over the plan's limits", async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          owner_id: OWNER,
          subscription_id: 'sub-1',
          plan_name: 'Free',
          limits: { transactions: 300 },
        },
      ],
    });
    const repo = new SqlTransactionLimitRepository({ query });
    await expect(repo.findOwnerPlan(WS)).resolves.toEqual({
      ownerId: OWNER,
      hasSubscription: true,
      planName: 'Free',
      limits: { transactions: 300 },
    });
    expect(query.mock.calls[0][0]).toMatch(/limits_snapshot/);
    expect(query.mock.calls[0][0]).toMatch(/w\.owner_id/);
  });
});

const mockRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body: any) => {
    res.body = body;
    return res;
  });
  return res as Response & { statusCode: number; body: any };
};

describe('TransactionController plan limit', () => {
  const ACCOUNT = '55555555-5555-4555-8555-555555555555';
  const ACCOUNT_2 = '66666666-6666-4666-8666-666666666666';

  const build = (used: number) => {
    const repo = new FakeRepo();
    repo.add(used);
    const limit = new TransactionLimitService(repo, () => NOW);
    const txRepo = {
      create: jest.fn().mockResolvedValue({ data: { id: 'tx-1' }, error: null }),
      transfer: jest.fn().mockResolvedValue({
        data: { withdraw: { id: 'w' }, deposit: { id: 'd' } },
        error: null,
      }),
    };
    const controller = new TransactionController(txRepo as any, undefined, undefined, () => limit);
    return { controller, txRepo };
  };

  const createReq = () =>
    ({
      params: { workspaceId: WS, accountId: ACCOUNT },
      body: { type: 'expense', amount: 5, currency: 'USD', date: '2020-01-01' },
      user: { userId: OWNER },
    }) as unknown as Request;

  const transferReq = () =>
    ({
      params: { workspaceId: WS },
      body: { fromAccountId: ACCOUNT, toAccountId: ACCOUNT_2, amount: 5, currency: 'USD', date: '2026-11-15' },
      user: { userId: OWNER },
    }) as unknown as Request;

  it('creates under the limit', async () => {
    const { controller, txRepo } = build(10);
    const res = mockRes();
    await controller.createTransaction(createReq(), res);
    expect(res.statusCode).toBe(201);
    expect(txRepo.create).toHaveBeenCalled();
  });

  it('answers 402 with code, limit, used and resetsAt at the limit, and writes nothing', async () => {
    const { controller, txRepo } = build(300);
    const res = mockRes();
    await controller.createTransaction(createReq(), res);
    expect(res.statusCode).toBe(402);
    expect(res.body).toEqual({
      message:
        "You've added 300 transactions this month, the limit on the Free plan. Upgrade to add more.",
      code: 'TRANSACTION_LIMIT_REACHED',
      feature: 'transactions',
      limit: 300,
      used: 300,
      resetsAt: '2026-12-01T00:00:00.000Z',
    });
    expect(txRepo.create).not.toHaveBeenCalled();
  });

  it('refuses a transfer that needs two rows when one is left', async () => {
    const { controller, txRepo } = build(299);
    const res = mockRes();
    await controller.transfer(transferReq(), res);
    expect(res.statusCode).toBe(402);
    expect(res.body.code).toBe('TRANSACTION_LIMIT_REACHED');
    expect(txRepo.transfer).not.toHaveBeenCalled();
  });

  it('allows a transfer with two left', async () => {
    const { controller, txRepo } = build(298);
    const res = mockRes();
    await controller.transfer(transferReq(), res);
    expect(res.statusCode).toBe(201);
    expect(txRepo.transfer).toHaveBeenCalled();
  });

  it('keeps other errors as { message } only', async () => {
    const { controller } = build(0);
    const res = mockRes();
    await controller.createTransaction(
      { ...createReq(), params: { accountId: ACCOUNT } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Workspace not found' });
  });
});

describe('SubscriptionController workspace usage', () => {
  it('reports transactionsThisMonth and transactionsResetAt for the workspace', async () => {
    const repo = new FakeRepo();
    repo.add(42);
    repo.add(7, { source: 'sync' });
    const limit = new TransactionLimitService(repo, () => NOW);
    const controller = new SubscriptionController(
      {
        getCurrentSubscription: jest.fn().mockResolvedValue({
          data: {
            planId: 'plan-free',
            status: 'active',
            featuresSnapshot: [],
            limitsSnapshot: { transactions: 300 },
          },
          error: null,
        }),
        getPlans: jest.fn().mockResolvedValue({ data: [{ id: 'plan-free', name: 'Free' }] }),
      } as any,
      { countByWorkspace: jest.fn().mockResolvedValue({ data: { count: 1 } }) } as any,
      {
        getById: jest.fn().mockResolvedValue({ data: { id: WS, ownerId: OWNER }, error: null }),
        getWorkspacesByOwner: jest.fn().mockResolvedValue({ data: [{ id: WS }] }),
      } as any,
      () => limit,
    );
    const res = mockRes();
    await controller.getWorkspaceSubscription(
      { params: { workspaceId: WS }, user: { userId: OWNER } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.usage).toMatchObject({
      accounts: 1,
      transactionsThisMonth: 42,
      transactionsResetAt: '2026-12-01T00:00:00.000Z',
    });
  });
});
