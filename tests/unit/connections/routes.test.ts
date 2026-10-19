import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { RateLimitStore } from '@shared/middleware/rateLimit.middleware';
import { Store, build } from './fakes';

/**
 * Drives the real connections router (flag, auth, permission, validation,
 * controller, service) over in-memory repositories, with the permission check
 * stubbed.
 */

jest.mock('@config/ConfigLoader', () => ({
  ConfigLoader: {
    getInstance: () => ({
      get: (key: string) => ({ 'auth.jwt.secret': 'unit-test-secret' })[key],
    }),
  },
}));

jest.mock('@monitoring/logging/StructuredLogger', () => ({
  StructuredLogger: jest
    .fn()
    .mockImplementation(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}));

jest.mock('@shared/ActivityCaptureService', () => ({
  ActivityCaptureService: { getInstance: () => ({ log: async () => undefined }) },
}));

const mockPermission = { denied: new Set<string>() };
jest.mock('@shared/middleware/permission.middleware', () => ({
  requirePermission: (permission: string) => (_req: any, res: any, next: any) =>
    mockPermission.denied.has(permission)
      ? res.status(403).json({ message: `Forbidden: Missing permission ${permission}` })
      : next(),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  createConnectionsRouter,
  createSyncLimiter,
} = require('@domains/connections/routes/connections.routes');
/* eslint-enable @typescript-eslint/no-var-requires */

const WS = '11111111-1111-4111-8111-111111111111';
const token = jwt.sign({ userId: 'user-1', purpose: 'access' }, 'unit-test-secret');

const memoryStore = (): RateLimitStore => {
  const counts = new Map<string, number>();
  return {
    async hit(key: string) {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
  };
};

const app = (opts: { flag?: boolean; plan?: 'Free' | 'Pro' } = {}) => {
  const store = new Store();
  store.limits =
    opts.plan === 'Pro'
      ? { ownerId: 'owner-1', planName: 'Pro Monthly', limits: { connectedWallets: -1, hasPaymentConnections: true } }
      : { ownerId: 'owner-1', planName: 'Free', limits: { connectedWallets: 2, hasPaymentConnections: false } };
  const ctx = build(store);
  const server = express();
  server.use(express.json());
  server.use(
    '/v1',
    createConnectionsRouter(async () => ctx.service, {
      isEnabled: async () => opts.flag ?? true,
      syncLimiter: createSyncLimiter(memoryStore()),
    }),
  );
  return { server, store, ctx };
};

const auth = { Authorization: `Bearer ${token}` };

describe('connections routes', () => {
  beforeEach(() => mockPermission.denied.clear());

  it('answers 404 FEATURE_DISABLED while the flag is off, before auth', async () => {
    const { server } = app({ flag: false });
    const res = await request(server).get(`/v1/${WS}/connections`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FEATURE_DISABLED');
  });

  it('needs a token, then the permission', async () => {
    const { server } = app();
    expect((await request(server).get(`/v1/${WS}/connections`)).status).toBe(401);
    mockPermission.denied.add('integrations:view');
    expect((await request(server).get(`/v1/${WS}/connections`).set(auth)).status).toBe(403);
    mockPermission.denied.clear();
    mockPermission.denied.add('integrations:manage');
    const list = await request(server).get(`/v1/${WS}/connections`).set(auth);
    expect(list.status).toBe(200);
    expect(list.body.data.usage.wallets).toEqual({ used: 0, limit: 2 });
    const create = await request(server)
      .post(`/v1/${WS}/connections`)
      .set(auth)
      .send({ provider: 'crypto:bitcoin', address: 'bc1qone' });
    expect(create.status).toBe(403);
  });

  it('creates wallets up to the Free limit, then 402 CONNECTION_LIMIT_REACHED', async () => {
    const { server } = app();
    for (const address of ['bc1qone', 'bc1qtwo']) {
      const res = await request(server).post(`/v1/${WS}/connections`).set(auth).send({ provider: 'crypto:bitcoin', address });
      expect(res.status).toBe(201);
      expect(res.body.data.addressHint).toBe('bc1q…test');
    }
    const res = await request(server)
      .post(`/v1/${WS}/connections`)
      .set(auth)
      .send({ provider: 'crypto:bitcoin', address: 'bc1qthree' });
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      code: 'CONNECTION_LIMIT_REACHED',
      feature: 'connectedWallets',
      usage: { used: 2, limit: 2 },
    });
  });

  it('answers 402 PLAN_UPGRADE_REQUIRED for Stripe on Free, 503 when it is not out yet on Pro', async () => {
    const free = await request(app().server).post(`/v1/${WS}/connections`).set(auth).send({ provider: 'stripe' });
    expect(free.status).toBe(402);
    expect(free.body.code).toBe('PLAN_UPGRADE_REQUIRED');
    const pro = await request(app({ plan: 'Pro' }).server)
      .post(`/v1/${WS}/connections`)
      .set(auth)
      .send({ provider: 'stripe' });
    expect(pro.status).toBe(503);
    expect(pro.body.code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('guards the sign-in routes: plan, availability, provider and body', async () => {
    const start = (server: express.Express, provider = 'stripe') =>
      request(server).post(`/v1/${WS}/connections/oauth/${provider}/start`).set(auth).send({});
    const free = await start(app().server);
    expect(free.status).toBe(402);
    expect(free.body.code).toBe('PLAN_UPGRADE_REQUIRED');
    // Not configured in this harness: still "coming soon".
    const pro = await start(app({ plan: 'Pro' }).server);
    expect(pro.status).toBe(503);
    expect(pro.body.code).toBe('PROVIDER_UNAVAILABLE');
    expect((await start(app().server, 'crypto:bitcoin')).status).toBe(400);

    const { server } = app({ plan: 'Pro' });
    const complete = (body: object) =>
      request(server).post(`/v1/${WS}/connections/oauth/stripe/complete`).set(auth).send(body);
    expect((await complete({ code: 'ac_1' })).status).toBe(400);
    const unknown = await complete({ code: 'ac_1', state: 'a-state-nobody-issued' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('OAUTH_STATE_INVALID');
    mockPermission.denied.add('integrations:manage');
    expect((await start(server)).status).toBe(403);
  });

  it('validates bodies and params', async () => {
    const { server } = app();
    expect(
      (await request(server).post(`/v1/${WS}/connections`).set(auth).send({ provider: 'crypto:dogecoin' })).status,
    ).toBe(400);
    const bad = await request(server).post(`/v1/${WS}/connections`).set(auth).send({ provider: 'crypto:bitcoin', address: 'nope' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_ADDRESS');
    expect((await request(server).get(`/v1/not-a-uuid/connections`).set(auth)).status).toBe(400);
    const links = await request(server)
      .post(`/v1/${WS}/connections/${WS}/links`)
      .set(auth)
      .send({ links: [{ assetKey: 'btc:native', syncMode: 'history' }] });
    expect(links.status).toBe(400);
  });

  it('links, syncs once a minute, and deletes', async () => {
    const { server, store, ctx } = app();
    ctx.provider.balanceValue = '0.25';
    const created = await request(server)
      .post(`/v1/${WS}/connections`)
      .set(auth)
      .send({ provider: 'crypto:bitcoin', address: 'bc1qone' });
    const id = created.body.data.id;
    const assets = await request(server).get(`/v1/${WS}/connections/${id}/assets`).set(auth);
    expect(assets.status).toBe(200);
    expect(assets.body.data.assets[0].assetKey).toBe('btc:native');
    const linked = await request(server)
      .post(`/v1/${WS}/connections/${id}/links`)
      .set(auth)
      .send({ links: [{ assetKey: 'btc:native', newAccount: { name: 'BTC' }, syncMode: 'from_today' }] });
    expect(linked.status).toBe(200);
    expect(linked.body.data.connection.links[0]).toMatchObject({ providerBalance: '0.25000000', importedCount: 1 });

    expect((await request(server).post(`/v1/${WS}/connections/${id}/sync`).set(auth)).status).toBe(200);
    const again = await request(server).post(`/v1/${WS}/connections/${id}/sync`).set(auth);
    expect(again.status).toBe(429);
    expect(again.body.code).toBe('TOO_MANY_SYNCS');

    const linkId = linked.body.data.connection.links[0].id;
    const unlinked = await request(server)
      .delete(`/v1/${WS}/connections/${id}/links/${linkId}?deleteImported=true`)
      .set(auth);
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.data.links).toEqual([]);
    expect((await request(server).delete(`/v1/${WS}/connections/${id}`).set(auth)).status).toBe(204);
    expect(store.connections.size).toBe(0);
    expect((await request(server).delete(`/v1/${WS}/connections/${id}`).set(auth)).status).toBe(404);
  });
});
