import express from 'express';
import request from 'supertest';
import {
  RevenueCatWebhookHandler,
  webhookAuthorized,
} from '@domains/store-billing/RevenueCatWebhookHandler';
import { RevenueCatClient } from '@domains/store-billing/RevenueCatClient';
import { StoreSubscriptionService } from '@domains/store-billing/StoreSubscriptionService';
import { StoreBillingError } from '@domains/store-billing/subscriptionSource';
import { SubscriptionRow } from '@domains/store-billing/StoreSubscriptionRepository';
import { FakeStoreRepo, NOW, USER_ID, rcEvent } from './fakes';

// The middleware module builds a Redis-backed rate limiter at import time; keep it local.
jest.mock('@factories/ServiceFactory', () => ({
  ServiceFactory: { getSharedRedisClient: async () => null },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  rejectIfManagedByGooglePlay,
  syncStoreSubscriptionHandler,
} = require('@domains/store-billing/storeBilling.middleware');

const SECRET = 'Bearer rc_webhook_unit_secret_0123456789';
const quiet = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('webhookAuthorized', () => {
  it('accepts only the exact configured header', () => {
    expect(webhookAuthorized(SECRET, SECRET)).toBe(true);
    expect(webhookAuthorized('Bearer wrong', SECRET)).toBe(false);
    expect(webhookAuthorized(`${SECRET} `, SECRET)).toBe(false);
    expect(webhookAuthorized(undefined, SECRET)).toBe(false);
    expect(webhookAuthorized(SECRET, '')).toBe(false);
    expect(webhookAuthorized(SECRET, undefined)).toBe(false);
  });
});

describe('POST /api/v1/webhooks/revenuecat', () => {
  const build = (secret: string | undefined, service: Partial<StoreSubscriptionService>) => {
    const handler = new RevenueCatWebhookHandler(
      () => secret,
      () => service as StoreSubscriptionService,
      quiet,
    );
    const app = express();
    app.use(express.json());
    app.post('/api/v1/webhooks/revenuecat', (req, res) => handler.handle(req, res));
    return app;
  };

  it('refuses everything when the secret is not configured', async () => {
    const handleWebhookEvent = jest.fn();
    const res = await request(build(undefined, { handleWebhookEvent }))
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', SECRET)
      .send({ event: rcEvent() });
    expect(res.status).toBe(500);
    expect(handleWebhookEvent).not.toHaveBeenCalled();
  });

  it('401 for a missing or wrong Authorization header', async () => {
    const handleWebhookEvent = jest.fn();
    const app = build(SECRET, { handleWebhookEvent });
    expect(
      (await request(app).post('/api/v1/webhooks/revenuecat').send({ event: rcEvent() })).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/webhooks/revenuecat')
          .set('Authorization', 'Bearer guess')
          .send({ event: rcEvent() })
      ).status,
    ).toBe(401);
    expect(handleWebhookEvent).not.toHaveBeenCalled();
  });

  it('400 for a body without an event', async () => {
    const res = await request(build(SECRET, { handleWebhookEvent: jest.fn() }))
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', SECRET)
      .send({ hello: 'world' });
    expect(res.status).toBe(400);
  });

  it('200 with the outcome, end to end with the service', async () => {
    const repo = new FakeStoreRepo();
    repo.seed(USER_ID, {});
    const service = new StoreSubscriptionService({
      repository: repo,
      client: null,
      acceptSandbox: true,
      now: () => NOW,
      logger: quiet,
    });
    const app = build(SECRET, service);
    const event = rcEvent();
    const first = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', SECRET)
      .send({ api_version: '1.0', event });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ received: true, outcome: 'applied' });
    const again = await request(app)
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', SECRET)
      .send({ api_version: '1.0', event });
    expect(again.body.outcome).toBe('duplicate');
    expect(repo.row().paymentProvider).toBe('google_play');
  });

  it('200 for an unknown user, so RevenueCat does not retry', async () => {
    const service = new StoreSubscriptionService({
      repository: new FakeStoreRepo(),
      client: null,
      acceptSandbox: true,
      now: () => NOW,
      logger: quiet,
    });
    const res = await request(build(SECRET, service))
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', SECRET)
      .send({
        event: rcEvent({ app_user_id: 'someone-else', original_app_user_id: null, aliases: [] }),
      });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('unknown_user');
  });

  it('500 when applying fails, so RevenueCat retries', async () => {
    const res = await request(
      build(SECRET, { handleWebhookEvent: jest.fn().mockRejectedValue(new Error('db down')) }),
    )
      .post('/api/v1/webhooks/revenuecat')
      .set('Authorization', SECRET)
      .send({ event: rcEvent() });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('db down');
  });
});

const playRow = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: 'sub-1',
  userId: USER_ID,
  planId: 'plan-pro',
  planKey: 'pro',
  status: 'active',
  paymentProvider: 'google_play',
  merchantSubscriptionId: 'GPA.1',
  billingCycle: 'monthly',
  currentPeriodEnd: new Date('2026-11-19T00:00:00Z'),
  cancelAtPeriodEnd: false,
  storeProductId: 'pro:monthly',
  storeOriginalTransactionId: 'GPA.1',
  storeManagementUrl: null,
  storeEnvironment: 'PRODUCTION',
  storeState: 'active',
  storeLastEventAt: NOW,
  ...over,
});

const withUser = (app: express.Express) =>
  app.use((req, _res, next) => {
    (req as any).user = { userId: USER_ID };
    next();
  });

describe('one biller per user: 409 guard (web checkout, change plan, cancel)', () => {
  const build = (row: SubscriptionRow | null | Error) => {
    const app = withUser(express());
    app.post(
      '/checkout',
      rejectIfManagedByGooglePlay(async () => {
        if (row instanceof Error) throw row;
        return row;
      }),
      (_req: express.Request, res: express.Response) => res.json({ ok: true }),
    );
    return app;
  };

  it('409 SUBSCRIPTION_MANAGED_BY_GOOGLE_PLAY while Play bills the plan', async () => {
    const res = await request(build(playRow())).post('/checkout');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SUBSCRIPTION_MANAGED_BY_GOOGLE_PLAY');
    expect(res.body.message).toMatch(/Google Play/);
  });

  it('lets Paddle, Free and ended Play plans through', async () => {
    expect(
      (await request(build(playRow({ paymentProvider: 'paddle' }))).post('/checkout')).status,
    ).toBe(200);
    expect(
      (await request(build(playRow({ planKey: 'free', paymentProvider: null }))).post('/checkout'))
        .status,
    ).toBe(200);
    expect((await request(build(null)).post('/checkout')).status).toBe(200);
  });

  it('fails open if the row cannot be read', async () => {
    expect((await request(build(new Error('db'))).post('/checkout')).status).toBe(200);
  });
});

describe('POST /subscription/sync', () => {
  const build = (sync: jest.Mock, row: SubscriptionRow | null) => {
    const app = withUser(express());
    app.post(
      '/subscription/sync',
      syncStoreSubscriptionHandler(
        () => ({ syncOrConflict: sync }),
        async () => row,
      ),
    );
    return app;
  };

  it('returns the applied plan and billing fields', async () => {
    const sync = jest.fn().mockResolvedValue({ outcome: 'applied', conflict: false });
    const res = await request(build(sync, playRow({ cancelAtPeriodEnd: true }))).post(
      '/subscription/sync',
    );
    expect(sync).toHaveBeenCalledWith(USER_ID);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      synced: true,
      outcome: 'applied',
      subscription: {
        plan: 'pro',
        status: 'active',
        source: 'google_play',
        managementUrl: 'https://play.google.com/store/account/subscriptions',
        willRenew: false,
        expiresAt: '2026-11-19T00:00:00.000Z',
        billingPeriod: 'monthly',
      },
    });
  });

  it('passes the coded errors through (409 conflict, 503 unavailable)', async () => {
    const conflict = jest
      .fn()
      .mockRejectedValue(
        new StoreBillingError('Paddle bills it', 409, 'SUBSCRIPTION_MANAGED_BY_PADDLE'),
      );
    const res = await request(build(conflict, null)).post('/subscription/sync');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      message: 'Paddle bills it',
      code: 'SUBSCRIPTION_MANAGED_BY_PADDLE',
    });

    const unavailable = jest
      .fn()
      .mockRejectedValue(new StoreBillingError('n/a', 503, 'STORE_BILLING_UNAVAILABLE'));
    expect((await request(build(unavailable, null)).post('/subscription/sync')).status).toBe(503);
  });
});

describe('RevenueCatClient', () => {
  it('GETs /v1/subscribers/{id} with the secret key and returns the subscriber', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ subscriber: { subscriptions: {} } }),
    });
    const client = new RevenueCatClient({ secretApiKey: 'sk_test', fetchFn: fetchFn as any });
    expect(await client.getSubscriber(USER_ID)).toEqual({ subscriptions: {} });
    expect(fetchFn).toHaveBeenCalledWith(
      `https://api.revenuecat.com/v1/subscribers/${USER_ID}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer sk_test' }),
      }),
    );
  });

  it('throws without leaking the key on errors', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ message: 'Invalid API key' }),
    });
    const client = new RevenueCatClient({ secretApiKey: 'sk_secret', fetchFn: fetchFn as any });
    const error = await client.getSubscriber(USER_ID).catch((e) => e);
    expect(error.message).toBe('RevenueCat answered 401: Invalid API key');
    expect(error.message).not.toContain('sk_secret');
  });
});
