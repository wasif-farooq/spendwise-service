import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { User } from '@domains/auth/models/User';
import { AuthService } from '@domains/auth/services/AuthService';
import { AuthController } from '@domains/auth/controllers/AuthController';
import { AuthRequestRepository } from '@domains/auth/repositories/AuthRequestRepository';
import { HANDOFF_INVALID_MESSAGE } from '@domains/auth/services/AuthHandoff';
import { createFakeRedis, FakeRedis } from '../../helpers/fakeRedis';

/**
 * Drives the real auth router (requireAuth, rate limiters, validation,
 * controller, request repository, service) with Redis replaced by an
 * in-memory fake. Only the DI lookups are stubbed.
 */

const JWT_SECRET = 'unit-test-secret';

jest.mock('@config/ConfigLoader', () => ({
  ConfigLoader: {
    getInstance: () => ({
      get: (key: string) => {
        const values: Record<string, any> = {
          'auth.jwt.secret': 'unit-test-secret',
          'auth.jwt.accessTokenExpiry': '15m',
          'auth.jwt.refreshTokenExpiry': '7d',
          'repository.mode': 'direct',
        };
        return values[key];
      },
    }),
  },
}));

// Shared between the rate limiter's store and the service's cache.
const mockState: { redis: FakeRedis | null; controller: any } = { redis: null, controller: null };

jest.mock('@factories/ServiceFactory', () => ({
  ServiceFactory: { getSharedRedisClient: async () => mockState.redis },
}));

jest.mock('@shared/middlewares/controller.middleware', () => ({
  controllerMiddleware: () => (req: any, _res: any, next: any) => {
    req.controller = mockState.controller;
    next();
  },
}));

jest.mock('@monitoring/logging/StructuredLogger', () => ({
  StructuredLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const authRoutes = require('@domains/auth/routes/auth.routes').default;

const USER_ID = '33333333-3333-4333-8333-333333333333';

const user = User.restore(
  {
    email: 'route@example.com',
    isActive: true,
    status: 'active',
    role: 'free' as any,
    createdAt: new Date(),
    updatedAt: new Date(),
    twoFactorEnabled: false,
    twoFactorMethods: [],
    backupCodes: [],
  } as any,
  USER_ID,
);

const accessToken = (overrides: Record<string, unknown> = {}) =>
  jwt.sign({ userId: USER_ID, email: user.email, purpose: 'access', ...overrides }, JWT_SECRET, {
    expiresIn: '15m',
  });

const buildApp = () => {
  const redis = createFakeRedis();
  const userRepo = {
    findById: jest.fn().mockImplementation(async (id: string) => (id === USER_ID ? user : null)),
  };
  const service = new AuthService(
    {} as any,
    userRepo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    redis,
  );
  const repository = new AuthRequestRepository();
  (repository as any).cachedService = service;

  mockState.redis = redis;
  mockState.controller = new AuthController(repository);

  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', authRoutes);
  return { app, redis };
};

const issue = (app: express.Express, token = accessToken()) =>
  request(app)
    .post('/api/v1/auth/handoff')
    .set('Authorization', `Bearer ${token}`)
    .send({ scope: 'checkout' });

describe('POST /auth/handoff', () => {
  it('issues a code to a signed-in user', async () => {
    const { app } = buildApp();

    const res = await issue(app);

    expect(res.status).toBe(200);
    expect(res.body.data.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.body.data.expiresIn).toBe(60);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('defaults the scope to checkout', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/v1/auth/handoff')
      .set('Authorization', `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.scope).toBe('checkout');
  });

  it('rejects an unauthenticated request', async () => {
    const { app, redis } = buildApp();

    const res = await request(app).post('/api/v1/auth/handoff').send({ scope: 'checkout' });

    expect(res.status).toBe(401);
    expect(redis.store.size).toBe(0);
  });

  it('rejects a refresh token used as a session', async () => {
    const { app } = buildApp();

    const res = await issue(app, accessToken({ purpose: 'refresh' }));

    expect(res.status).toBe(401);
  });

  it('rejects an unknown scope', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/v1/auth/handoff')
      .set('Authorization', `Bearer ${accessToken()}`)
      .send({ scope: 'admin' });

    expect(res.status).toBe(400);
  });

  it('rate limits issuing per user', async () => {
    const { app } = buildApp();

    for (let i = 0; i < 20; i++) {
      expect((await issue(app)).status).toBe(200);
    }
    const res = await issue(app);

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe(String(15 * 60));
  });
});

describe('POST /auth/handoff/exchange', () => {
  const exchange = (app: express.Express, code: unknown) =>
    request(app).post('/api/v1/auth/handoff/exchange').send({ code });

  it('returns the login response shape for a valid code', async () => {
    const { app } = buildApp();
    const { code } = (await issue(app)).body.data;

    const res = await exchange(app, code);

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.user).toBeDefined();
    expect(res.headers['cache-control']).toBe('no-store');
    expect((jwt.verify(res.body.data.token, JWT_SECRET) as any).userId).toBe(USER_ID);
  });

  it('does not require a session', async () => {
    const { app } = buildApp();
    const { code } = (await issue(app)).body.data;

    // No Authorization header: the code is the credential.
    const res = await exchange(app, code);

    expect(res.status).toBe(200);
  });

  it('refuses a reused code with the generic error', async () => {
    const { app } = buildApp();
    const { code } = (await issue(app)).body.data;

    expect((await exchange(app, code)).status).toBe(200);
    const res = await exchange(app, code);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: HANDOFF_INVALID_MESSAGE });
  });

  it('refuses an expired code with the generic error', async () => {
    const { app, redis } = buildApp();
    const { code } = (await issue(app)).body.data;

    redis.advance(61);
    const res = await exchange(app, code);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: HANDOFF_INVALID_MESSAGE });
  });

  it('refuses a wrong code with the same generic error', async () => {
    const { app } = buildApp();
    await issue(app);

    const res = await exchange(app, 'x'.repeat(43));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: HANDOFF_INVALID_MESSAGE });
  });

  it('rejects a missing or oversized code before touching Redis', async () => {
    const { app } = buildApp();

    expect((await exchange(app, undefined)).status).toBe(400);
    expect((await exchange(app, 'x'.repeat(257))).status).toBe(400);
  });

  it('rate limits exchanges per IP', async () => {
    const { app } = buildApp();

    for (let i = 0; i < 20; i++) {
      expect((await exchange(app, `guess-${i}`)).status).toBe(401);
    }
    const res = await exchange(app, 'guess-final');

    expect(res.status).toBe(429);
  });
});
