import express from 'express';
import request from 'supertest';

/**
 * In-memory stand-ins for the subscription repositories, so the real
 * SubscriptionActivationService and PaddleBillingService run end to end
 * without Postgres.
 */
type Row = Record<string, any>;
const store: { subs: Row[]; payments: Map<string, Row>; updates: number } = {
  subs: [],
  payments: new Map(),
  updates: 0,
};

jest.mock('@domains/subscription/repositories/SubscriptionRepository', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const s = require('./paddleConfirm.test').__store;
  const plans: Record<string, Row> = {
    'plan-pro': { id: 'plan-pro', features: ['pro'], limits: { accounts: 10 } },
  };
  return {
    SubscriptionPlanRepository: class {
      async findById(id: string) {
        return plans[id] ?? null;
      }
    },
    UserSubscriptionRepository: class {
      async findByUserId(userId: string) {
        return s.subs.find((r: Row) => r.userId === userId) ?? null;
      }
      async findByMerchantSubscriptionId(id: string) {
        return s.subs.find((r: Row) => r.merchantSubscriptionId === id) ?? null;
      }
      async findById(id: string) {
        const row = s.subs.find((r: Row) => r.id === id);
        return row ? { ...row } : null;
      }
      // Like BaseRepository, update/create hand back raw snake_case rows, not entities.
      async update(id: string, data: Row) {
        s.updates++;
        const row = s.subs.find((r: Row) => r.id === id);
        Object.assign(row, data);
        return { id, plan_id: row.planId };
      }
      async create(data: Row) {
        const row = { id: `sub-${s.subs.length + 1}`, ...data };
        s.subs.push(row);
        return { id: row.id, plan_id: row.planId };
      }
      async updateStatusAndPeriod() {}
    },
  };
});

export const __store = store;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PaddleBillingService } = require('@domains/payment/services/PaddleBillingService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PaymentController } = require('@domains/payment/controllers/PaymentController');

/** Emulates the payments table's (provider, provider_payment_id) unique index. */
const fakeDb = {
  query: jest.fn(async (sql: string, params: unknown[]) => {
    if (/INSERT INTO payments/.test(sql)) {
      const key = `${params[2]}:${params[3]}`;
      const prev = store.payments.get(key);
      store.payments.set(key, { ...(prev || {}), amount: params[4], status: params[6] });
    }
    return { rows: [] };
  }),
};

const txn = (over: Row = {}) => ({
  id: 'txn_01hpaidpaidpaid',
  status: 'completed',
  customer_id: 'ctm_1',
  subscription_id: 'sub_01paddle',
  currency_code: 'USD',
  custom_data: { userId: 'user-1', planId: 'plan-pro', billingPeriod: 'monthly', app: 'spendwise' },
  billing_period: { starts_at: '2026-09-27T00:00:00Z', ends_at: '2026-10-27T00:00:00Z' },
  details: { totals: { grand_total: '999' } },
  ...over,
});

const gatewayReturning = (t: Row) => ({ getTransaction: jest.fn(async () => t) });

beforeEach(() => {
  store.subs = [
    {
      id: 'sub-1',
      userId: 'user-1',
      planId: 'plan-free',
      status: 'active',
      paymentProvider: undefined,
    },
  ];
  store.payments = new Map();
  store.updates = 0;
  fakeDb.query.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('PaddleBillingService.confirmTransaction', () => {
  it('activates the plan from custom_data and records the payment', async () => {
    const svc = new PaddleBillingService(gatewayReturning(txn()), fakeDb);
    const res = await svc.confirmTransaction('user-1', 'txn_01hpaidpaidpaid');

    expect(res).toMatchObject({
      status: 'active',
      activated: true,
      subscription: { planId: 'plan-pro', status: 'active', paymentProvider: 'paddle' },
    });
    expect(store.subs[0]).toMatchObject({
      planId: 'plan-pro',
      merchantSubscriptionId: 'sub_01paddle',
      billingCycle: 'monthly',
      featuresSnapshot: ['pro'],
      limitsSnapshot: { accounts: 10 },
      currentPeriodEnd: new Date('2026-10-27T00:00:00Z'),
    });
    expect(store.payments.get('paddle:txn_01hpaidpaidpaid')).toEqual({
      amount: 999,
      status: 'succeeded',
    });
  });

  it('is idempotent: a second confirm changes nothing and records no second payment', async () => {
    const svc = new PaddleBillingService(gatewayReturning(txn()), fakeDb);
    await svc.confirmTransaction('user-1', 'txn_01hpaidpaidpaid');
    const updatesAfterFirst = store.updates;

    const again = await svc.confirmTransaction('user-1', 'txn_01hpaidpaidpaid');
    expect(again).toMatchObject({ status: 'active', activated: false });
    expect(store.updates).toBe(updatesAfterFirst);
    expect(store.subs).toHaveLength(1);
    expect(store.payments.size).toBe(1);
  });

  it('accepts a paid transaction whose subscription does not exist yet', async () => {
    const svc = new PaddleBillingService(
      gatewayReturning(txn({ status: 'paid', subscription_id: null })),
      fakeDb,
    );
    const res = await svc.confirmTransaction('user-1', 'txn_01hpaidpaidpaid');
    expect(res.status).toBe('active');
    expect(store.subs[0].planId).toBe('plan-pro');
    expect('merchantSubscriptionId' in store.subs[0]).toBe(false);
  });

  it("refuses another user's transaction", async () => {
    const svc = new PaddleBillingService(gatewayReturning(txn()), fakeDb);
    await expect(svc.confirmTransaction('user-2', 'txn_01hpaidpaidpaid')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(store.subs[0].planId).toBe('plan-free');
    expect(fakeDb.query).not.toHaveBeenCalled();
  });

  it("refuses another product's transaction on the shared Paddle account", async () => {
    const svc = new PaddleBillingService(
      gatewayReturning(
        txn({ custom_data: { userId: 'user-1', planId: 'plan-pro', app: 'bippass' } }),
      ),
      fakeDb,
    );
    await expect(svc.confirmTransaction('user-1', 'txn_01hpaidpaidpaid')).rejects.toMatchObject({
      statusCode: 403,
    });
    const noData = new PaddleBillingService(gatewayReturning(txn({ custom_data: null })), fakeDb);
    await expect(noData.confirmTransaction('user-1', 'txn_01hpaidpaidpaid')).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('reports pending, without activating, until Paddle has collected the money', async () => {
    for (const status of ['draft', 'ready', 'billed']) {
      const svc = new PaddleBillingService(gatewayReturning(txn({ status })), fakeDb);
      expect(await svc.confirmTransaction('user-1', 'txn_01hpaidpaidpaid')).toEqual({
        status: 'pending',
        transactionId: 'txn_01hpaidpaidpaid',
        transactionStatus: status,
      });
    }
    expect(store.subs[0].planId).toBe('plan-free');
  });

  it('rejects malformed transaction ids before calling Paddle', async () => {
    const gw = gatewayReturning(txn());
    const svc = new PaddleBillingService(gw, fakeDb);
    await expect(svc.confirmTransaction('user-1', '../customers')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(gw.getTransaction).not.toHaveBeenCalled();
  });

  it('webhook transaction.completed uses the same activation and ignores foreign events', async () => {
    const svc = new PaddleBillingService(gatewayReturning(txn()), fakeDb);
    expect(
      await svc.handleEvent({
        event_type: 'transaction.completed',
        data: txn({ custom_data: { app: 'bippass' } }),
      }),
    ).toBe('ignored');
    expect(store.subs[0].planId).toBe('plan-free');

    expect(await svc.handleEvent({ event_type: 'transaction.completed', data: txn() })).toBe(
      'applied',
    );
    expect(store.subs[0].planId).toBe('plan-pro');
    // …and a confirm afterwards is a no-op.
    const res = await svc.confirmTransaction('user-1', 'txn_01hpaidpaidpaid');
    expect(res).toMatchObject({ status: 'active', activated: false });
    expect(store.payments.size).toBe(1);
  });
});

describe('POST /payment/paddle/confirm (controller)', () => {
  const build = (repo: Row, userId: string | null = 'user-1') => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (userId) (req as any).user = { userId };
      next();
    });
    const controller = new PaymentController(repo);
    app.post('/payment/paddle/confirm', (req, res) => controller.confirmPaddle(req, res));
    return app;
  };

  const repoFor = (gateway: Row) => ({
    confirmPaddleTransaction: (userId: string, id: string) =>
      new PaddleBillingService(gateway, fakeDb).confirmTransaction(userId, id),
  });

  it('returns 200 with the active subscription', async () => {
    const res = await request(build(repoFor(gatewayReturning(txn()))))
      .post('/payment/paddle/confirm')
      .send({ transactionId: 'txn_01hpaidpaidpaid' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'active',
      subscription: {
        planId: 'plan-pro',
        status: 'active',
        paymentProvider: 'paddle',
        merchantSubscriptionId: 'sub_01paddle',
      },
    });
  });

  it('creates the subscription row when the user has none yet', async () => {
    store.subs = [];
    const res = await request(build(repoFor(gatewayReturning(txn()))))
      .post('/payment/paddle/confirm')
      .send({ transactionId: 'txn_01hpaidpaidpaid' });
    expect(res.status).toBe(200);
    expect(res.body.subscription).toMatchObject({ planId: 'plan-pro', paymentProvider: 'paddle' });
    expect(store.subs).toHaveLength(1);
  });

  it("returns 403 for someone else's transaction", async () => {
    const res = await request(build(repoFor(gatewayReturning(txn())), 'user-2'))
      .post('/payment/paddle/confirm')
      .send({ transactionId: 'txn_01hpaidpaidpaid' });
    expect(res.status).toBe(403);
  });

  it('returns 202 while pending, 400 without an id, 401 without a user', async () => {
    const pending = await request(build(repoFor(gatewayReturning(txn({ status: 'ready' })))))
      .post('/payment/paddle/confirm')
      .send({ transactionId: 'txn_01hpaidpaidpaid' });
    expect(pending.status).toBe(202);

    const noId = await request(build(repoFor(gatewayReturning(txn()))))
      .post('/payment/paddle/confirm')
      .send({});
    expect(noId.status).toBe(400);

    const anon = await request(build(repoFor(gatewayReturning(txn())), null))
      .post('/payment/paddle/confirm')
      .send({ transactionId: 'txn_01hpaidpaidpaid' });
    expect(anon.status).toBe(401);
  });
});
