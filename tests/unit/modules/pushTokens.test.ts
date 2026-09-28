import 'express-async-errors';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PushTokenController } from '@domains/notifications/controllers/PushTokenController';
import { PushTokenService } from '@domains/notifications/services/PushTokenService';
import { PushTokenRepository } from '@domains/notifications/repositories/PushTokenRepository';
import { EXPO_PUSH_TOKEN } from '@domains/notifications/validators/pushToken.validation';
import { errorMiddleware } from '@shared/middleware/error.middleware';

/**
 * Drives the real push-token router (requireAuth, validation, controller, service and
 * repository SQL) with the database replaced by an in-memory table.
 */

const JWT_SECRET = 'unit-test-secret';

jest.mock('@config/ConfigLoader', () => ({
  ConfigLoader: {
    getInstance: () => ({
      get: (key: string) => (key === 'auth.jwt.secret' ? 'unit-test-secret' : undefined),
    }),
  },
}));

jest.mock('@database/factories/PostgresFactory', () => ({
  PostgresFactory: jest.fn().mockImplementation(() => ({
    createDatabase: () => ({ query: jest.fn() }),
  })),
}));

jest.mock('@monitoring/logging/StructuredLogger', () => ({
  StructuredLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createPushTokenRouter } = require('@domains/notifications/routes/push-tokens.routes');

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'ExponentPushToken[abcDEF123_-xyz]';

const bearer = (userId: string, extra: Record<string, unknown> = {}) =>
  `Bearer ${jwt.sign({ userId, purpose: 'access', ...extra }, JWT_SECRET, { expiresIn: '15m' })}`;

/** A tiny stand-in for Postgres that understands the three statements the repository issues. */
const createFakeDb = () => {
  const rows: any[] = [];
  const query = jest.fn(async (sql: string, params: any[] = []) => {
    if (sql.startsWith('INSERT INTO push_tokens')) {
      const [userId, token, platform, deviceName, appVersion] = params;
      let row = rows.find((r) => r.token === token);
      const now = new Date();
      if (row) {
        Object.assign(row, {
          user_id: userId,
          platform,
          device_name: deviceName,
          app_version: appVersion,
          updated_at: now,
          last_seen_at: now,
        });
      } else {
        row = {
          id: `id-${rows.length + 1}`,
          user_id: userId,
          token,
          platform,
          device_name: deviceName,
          app_version: appVersion,
          created_at: now,
          updated_at: now,
          last_seen_at: now,
        };
        rows.push(row);
      }
      return { rows: [row], rowCount: 1 };
    }
    if (sql.startsWith('DELETE FROM push_tokens')) {
      const [token, userId] = params;
      const i = rows.findIndex((r) => r.token === token && r.user_id === userId);
      if (i >= 0) rows.splice(i, 1);
      return { rows: [], rowCount: i >= 0 ? 1 : 0 };
    }
    if (sql.startsWith('SELECT * FROM push_tokens')) {
      return { rows: rows.filter((r) => r.user_id === params[0]) };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  });
  return { rows, query };
};

const buildApp = () => {
  const db = createFakeDb();
  const repository = new PushTokenRepository(db as any);
  const service = new PushTokenService(repository);
  const app = express();
  app.use(express.json());
  app.use('/api/v1/notifications/push-tokens', createPushTokenRouter(new PushTokenController(service)));
  app.use(errorMiddleware);
  return { app, db, service };
};

const register = (app: express.Express, body: Record<string, unknown>, userId = ALICE) =>
  request(app)
    .post('/api/v1/notifications/push-tokens')
    .set('Authorization', bearer(userId))
    .send(body);

const unregister = (app: express.Express, token: string, userId = ALICE) =>
  request(app)
    .delete(`/api/v1/notifications/push-tokens/${encodeURIComponent(token)}`)
    .set('Authorization', bearer(userId));

describe('POST /notifications/push-tokens', () => {
  it('stores the token for the signed-in user', async () => {
    const { app, db } = buildApp();

    const res = await register(app, {
      token: TOKEN,
      platform: 'ios',
      deviceName: 'iPhone 16',
      appVersion: '1.0.0',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      token: TOKEN,
      platform: 'ios',
      deviceName: 'iPhone 16',
      appVersion: '1.0.0',
    });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ user_id: ALICE, token: TOKEN, platform: 'ios' });
  });

  it('is idempotent: registering the same token again keeps one row', async () => {
    const { app, db } = buildApp();

    await register(app, { token: TOKEN, platform: 'android' });
    const res = await register(app, { token: TOKEN, platform: 'android', appVersion: '1.0.1' });

    expect(res.status).toBe(201);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].app_version).toBe('1.0.1');
  });

  it('moves a token to the user who signs in on the same device', async () => {
    const { app, db } = buildApp();

    await register(app, { token: TOKEN, platform: 'ios' }, ALICE);
    await register(app, { token: TOKEN, platform: 'ios' }, BOB);

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].user_id).toBe(BOB);
  });

  it('accepts the newer ExpoPushToken[...] form', async () => {
    const { app } = buildApp();
    const res = await register(app, { token: 'ExpoPushToken[q1w2e3]', platform: 'android' });
    expect(res.status).toBe(201);
  });

  it.each([
    ['a missing token', { platform: 'ios' }],
    ['a non-Expo token', { token: 'fcm:abcdef', platform: 'android' }],
    ['a token with a bad payload', { token: 'ExponentPushToken[a b]', platform: 'ios' }],
    ['an unknown platform', { token: TOKEN, platform: 'web' }],
    ['a too long device name', { token: TOKEN, platform: 'ios', deviceName: 'x'.repeat(101) }],
  ])('rejects %s with 400', async (_label, body) => {
    const { app, db } = buildApp();
    const res = await register(app, body);
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('drops fields the schema does not declare', async () => {
    const { app, db } = buildApp();
    await register(app, { token: TOKEN, platform: 'ios', userId: BOB });
    expect(db.rows[0].user_id).toBe(ALICE);
  });

  it('requires a session', async () => {
    const { app, db } = buildApp();
    const res = await request(app)
      .post('/api/v1/notifications/push-tokens')
      .send({ token: TOKEN, platform: 'ios' });
    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuses tokens minted for another purpose (refresh)', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/v1/notifications/push-tokens')
      .set('Authorization', bearer(ALICE, { purpose: 'refresh' }))
      .send({ token: TOKEN, platform: 'ios' });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /notifications/push-tokens/:token', () => {
  it('removes the caller’s token', async () => {
    const { app, db } = buildApp();
    await register(app, { token: TOKEN, platform: 'ios' });

    const res = await unregister(app, TOKEN);

    expect(res.status).toBe(204);
    expect(db.rows).toHaveLength(0);
  });

  it('does not remove another user’s token, and still answers 204', async () => {
    const { app, db } = buildApp();
    await register(app, { token: TOKEN, platform: 'ios' }, ALICE);

    const res = await unregister(app, TOKEN, BOB);

    expect(res.status).toBe(204);
    expect(db.rows).toHaveLength(1);
  });

  it('is idempotent for unknown tokens', async () => {
    const { app } = buildApp();
    const res = await unregister(app, 'ExponentPushToken[unknown]');
    expect(res.status).toBe(204);
  });

  it('rejects a malformed token with 400', async () => {
    const { app, db } = buildApp();
    const res = await unregister(app, 'not-a-token');
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    const { app } = buildApp();
    const res = await request(app).delete(
      `/api/v1/notifications/push-tokens/${encodeURIComponent(TOKEN)}`,
    );
    expect(res.status).toBe(401);
  });
});

describe('PushTokenService', () => {
  it('lists a user’s tokens', async () => {
    const { app, service } = buildApp();
    await register(app, { token: TOKEN, platform: 'ios' }, ALICE);
    await register(app, { token: 'ExpoPushToken[other]', platform: 'android' }, BOB);

    const tokens = await service.listForUser(ALICE);
    expect(tokens.map((t) => t.token)).toEqual([TOKEN]);
    expect(tokens[0]).toMatchObject({ userId: ALICE, platform: 'ios', deviceName: null });
  });

  it('refuses to act without a user id', async () => {
    const { service } = buildApp();
    await expect(service.register('', { token: TOKEN, platform: 'ios' })).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(service.unregister('', TOKEN)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('EXPO_PUSH_TOKEN', () => {
  it.each([
    ['ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]', true],
    ['ExpoPushToken[abc-_123]', true],
    ['ExponentPushToken[]', false],
    ['ExponentPushToken[abc', false],
    ['xExponentPushToken[abc]', false],
    ['ExponentPushToken[abc]x', false],
  ])('%s → %s', (value, ok) => {
    expect(EXPO_PUSH_TOKEN.test(value)).toBe(ok);
  });
});
