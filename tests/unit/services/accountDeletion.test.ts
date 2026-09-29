import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import bcrypt from 'bcrypt';
import { User } from '@domains/auth/models/User';
import {
  AccountDeletionDeps,
  AccountDeletionError,
  AccountDeletionService,
  classifyWorkspaces,
} from '@domains/auth/services/AccountDeletionService';
import {
  AccountDeletionRepository,
  DeletableSubscription,
  WorkspaceMembershipRow,
} from '@domains/auth/repositories/AccountDeletionRepository';
import { AccountDeletionController } from '@domains/auth/controllers/AccountDeletionController';
import { generateAccountDeletedEmail } from '@domains/email/EmailTemplates';
import { createFakeRedis, FakeRedis } from '../../helpers/fakeRedis';

/**
 * DELETE /auth/account: the service (re-authentication, the shared-workspace block,
 * Paddle cancellation, post-commit cleanup), the repository's SQL, and the router
 * (auth, rate limit, validation, error body) with the database replaced by fakes.
 */

const JWT_SECRET = 'unit-test-secret';

jest.mock('@config/ConfigLoader', () => ({
  ConfigLoader: {
    getInstance: () => ({
      get: (key: string) => (key === 'auth.jwt.secret' ? 'unit-test-secret' : undefined),
    }),
  },
}));

const mockRedis: { current: FakeRedis | null } = { current: null };
jest.mock('@factories/ServiceFactory', () => ({
  ServiceFactory: { getSharedRedisClient: async () => mockRedis.current },
}));

jest.mock('@monitoring/logging/StructuredLogger', () => ({
  StructuredLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createAccountDeletionRouter } = require('@domains/auth/routes/account-deletion.routes');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const PASSWORD = 'Correct-horse1!';
const TOTP_SECRET = speakeasy.generateSecret({ length: 20 }).base32;
const BACKUP_CODE = '12345678';

let passwordHash: string;
let backupHash: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
  backupHash = await bcrypt.hash(BACKUP_CODE, 4);
});

const makeUser = (twoFactor: 'off' | 'app' | 'email' = 'off') =>
  User.restore(
    {
      email: 'leaver@example.com',
      firstName: 'Lee',
      isActive: true,
      status: 'active',
      role: 'free' as any,
      createdAt: new Date(),
      updatedAt: new Date(),
      twoFactorEnabled: twoFactor !== 'off',
      twoFactorMethod: twoFactor === 'off' ? undefined : twoFactor,
      twoFactorSecret: twoFactor === 'app' ? TOTP_SECRET : undefined,
      twoFactorMethods: twoFactor === 'off' ? [] : [{ type: twoFactor, verified: true }],
      backupCodes: twoFactor === 'off' ? [] : [backupHash],
    } as any,
    USER_ID,
  );

const ws = (id: string, ownerId: string, otherMembers: number): WorkspaceMembershipRow => ({
  id,
  name: `Workspace ${id}`,
  ownerId,
  otherMembers,
});

interface Setup {
  user?: User | null;
  hasPassword?: boolean;
  workspaces?: WorkspaceMembershipRow[];
  /** Workspaces seen under the lock, when they differ (a race). */
  lockedWorkspaces?: WorkspaceMembershipRow[];
  subscriptions?: DeletableSubscription[];
  paddle?: Partial<Record<'getSubscription' | 'cancelSubscription', jest.Mock>> | null;
  storageFails?: boolean;
}

const setup = (options: Setup = {}) => {
  const user = options.user === undefined ? makeUser() : options.user;
  const workspaces = options.workspaces ?? [ws('solo', USER_ID, 0)];
  const events: string[] = [];

  const trx = { tag: 'trx' };
  const db = {
    transaction: jest.fn(async (cb: (t: any) => Promise<any>) => {
      events.push('begin');
      try {
        const result = await cb(trx);
        events.push('commit');
        return result;
      } catch (error) {
        events.push('rollback');
        throw error;
      }
    }),
  };

  const repository = {
    findWorkspaces: jest.fn(async (_userId: string, opts: { lock?: boolean } = {}) =>
      opts.lock ? (options.lockedWorkspaces ?? workspaces) : workspaces,
    ),
    findSubscriptions: jest.fn(async () => options.subscriptions ?? []),
    findWorkspaceObjects: jest.fn(async (ids: string[]) =>
      ids.map((id) => ({ bucket: 'receipts', key: `${id}/r.jpg` })),
    ),
    deleteUserData: jest.fn(async () => {
      events.push('delete');
      return { workspaces: 1, memberships: 1, invitations: 0, users: 1 };
    }),
  };

  const paddle =
    options.paddle === null
      ? null
      : {
          getSubscription: jest.fn(async (id: string) => ({
            id,
            status: 'active',
            customer_id: 'ctm_1',
            custom_data: { app: 'spendwise', userId: USER_ID },
          })),
          cancelSubscription: jest.fn(async () => {
            events.push('paddle-cancel');
          }),
          ...(options.paddle ?? {}),
        };

  const storage = {
    deleteObjects: jest.fn(async (objects: unknown[]) => {
      if (options.storageFails) throw new Error('connect ECONNREFUSED 127.0.0.1:9000');
      return objects.length;
    }),
    deletePrefix: jest.fn(async () => 0),
    getBucket: jest.fn(() => 'avatars-bucket'),
  };
  const mailer = { send: jest.fn(async () => ({ success: true })) };
  const cacheStore = new Map<string, string>();
  const cache = {
    get: jest.fn(async (k: string) => cacheStore.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => cacheStore.set(k, v)),
    del: jest.fn(async () => 1),
  };
  const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };
  const background: Promise<void>[] = [];

  const deps: AccountDeletionDeps = {
    db: db as any,
    repository: repository as any,
    userRepo: { findById: jest.fn(async (id: string) => (id === USER_ID ? user : null)) },
    authRepo: {
      findByUserIdAndProvider: jest.fn(async () =>
        options.hasPassword === false ? null : ({ passwordHash } as any),
      ),
    },
    getPaddle: () => paddle as any,
    getStorage: () => storage,
    mailer,
    cache,
    runInBackground: (task) => background.push(task),
    logger,
  };

  const service = new AccountDeletionService(deps);
  const settle = () => Promise.all(background);
  return { service, db, repository, paddle, storage, mailer, cache, logger, events, settle };
};

const expectCode = async (promise: Promise<unknown>, code: string, status: number) => {
  const error = await promise.then(
    () => null,
    (e) => e,
  );
  expect(error).toBeInstanceOf(AccountDeletionError);
  expect(error.code).toBe(code);
  expect(error.statusCode).toBe(status);
  return error as AccountDeletionError;
};

describe('classifyWorkspaces', () => {
  it('deletes solo owned workspaces, blocks shared owned ones, leaves the rest', () => {
    const result = classifyWorkspaces(USER_ID, [
      ws('solo', USER_ID, 0),
      ws('shared', USER_ID, 2),
      ws('theirs', OTHER_ID, 3),
      ws('theirs-alone', OTHER_ID, 0),
    ]);
    expect(result.toDelete.map((w) => w.id)).toEqual(['solo']);
    expect(result.blocking).toEqual([{ id: 'shared', name: 'Workspace shared', memberCount: 2 }]);
    expect(result.toLeave.map((w) => w.id)).toEqual(['theirs', 'theirs-alone']);
  });
});

describe('AccountDeletionService.deleteAccount: re-authentication', () => {
  it('requires the password when the account has one', async () => {
    const { service, repository } = setup();
    await expectCode(service.deleteAccount(USER_ID, {}), 'PASSWORD_REQUIRED', 400);
    await expectCode(
      service.deleteAccount(USER_ID, { confirm: 'DELETE' }),
      'PASSWORD_REQUIRED',
      400,
    );
    expect(repository.deleteUserData).not.toHaveBeenCalled();
  });

  it('rejects a wrong password with 400, not 401', async () => {
    const { service, repository } = setup();
    await expectCode(
      service.deleteAccount(USER_ID, { password: 'Wrong-pass1!' }),
      'INVALID_PASSWORD',
      400,
    );
    expect(repository.deleteUserData).not.toHaveBeenCalled();
  });

  it('asks a Google-only user to type DELETE', async () => {
    const { service, repository } = setup({ hasPassword: false });
    await expectCode(service.deleteAccount(USER_ID, {}), 'CONFIRMATION_REQUIRED', 400);
    await expectCode(
      service.deleteAccount(USER_ID, { confirm: 'delete' }),
      'CONFIRMATION_REQUIRED',
      400,
    );
    const result = await service.deleteAccount(USER_ID, { confirm: 'DELETE' });
    expect(result.deleted).toBe(true);
    expect(repository.deleteUserData).toHaveBeenCalledTimes(1);
  });

  it('404s for a user that no longer exists', async () => {
    const { service } = setup({ user: null });
    await expectCode(service.deleteAccount(USER_ID, { password: PASSWORD }), 'USER_NOT_FOUND', 404);
  });
});

describe('AccountDeletionService.deleteAccount: two-factor', () => {
  it('requires a code when 2FA is on', async () => {
    const { service } = setup({ user: makeUser('app') });
    await expectCode(
      service.deleteAccount(USER_ID, { password: PASSWORD }),
      'TWO_FACTOR_REQUIRED',
      400,
    );
  });

  it('accepts a current authenticator code', async () => {
    const { service, repository } = setup({ user: makeUser('app') });
    const code = speakeasy.totp({ secret: TOTP_SECRET, encoding: 'base32' });
    await service.deleteAccount(USER_ID, { password: PASSWORD, twoFactorCode: code });
    expect(repository.deleteUserData).toHaveBeenCalledTimes(1);
  });

  it('accepts a backup code (also for email 2FA)', async () => {
    const { service, repository } = setup({ user: makeUser('email') });
    await service.deleteAccount(USER_ID, { password: PASSWORD, twoFactorCode: BACKUP_CODE });
    expect(repository.deleteUserData).toHaveBeenCalledTimes(1);
  });

  it('rejects a 6-digit code when the only method is email', async () => {
    const { service } = setup({ user: makeUser('email') });
    await expectCode(
      service.deleteAccount(USER_ID, { password: PASSWORD, twoFactorCode: '123456' }),
      'INVALID_TWO_FACTOR_CODE',
      400,
    );
  });

  it('counts wrong codes and locks after five', async () => {
    const { service, cache, repository } = setup({ user: makeUser('app') });
    for (let i = 0; i < 5; i++) {
      await expectCode(
        service.deleteAccount(USER_ID, { password: PASSWORD, twoFactorCode: '99999999' }),
        'INVALID_TWO_FACTOR_CODE',
        400,
      );
    }
    expect(await cache.get(`2fa_attempts:${USER_ID}`)).toBe('5');
    const code = speakeasy.totp({ secret: TOTP_SECRET, encoding: 'base32' });
    await expectCode(
      service.deleteAccount(USER_ID, { password: PASSWORD, twoFactorCode: code }),
      'TOO_MANY_ATTEMPTS',
      429,
    );
    expect(repository.deleteUserData).not.toHaveBeenCalled();
  });
});

describe('AccountDeletionService.deleteAccount: workspaces', () => {
  it('blocks with 409 and lists owned workspaces that have other members', async () => {
    const { service, db, repository, paddle } = setup({
      workspaces: [ws('solo', USER_ID, 0), ws('family', USER_ID, 1), ws('work', USER_ID, 3)],
      subscriptions: [
        { id: 's1', status: 'active', paymentProvider: 'paddle', merchantSubscriptionId: 'sub_1' },
      ],
    });
    const error = await expectCode(
      service.deleteAccount(USER_ID, { password: PASSWORD }),
      'OWNED_SHARED_WORKSPACES',
      409,
    );
    expect(error.workspaces).toEqual([
      { id: 'family', name: 'Workspace family', memberCount: 1 },
      { id: 'work', name: 'Workspace work', memberCount: 3 },
    ]);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(paddle!.cancelSubscription).not.toHaveBeenCalled();
    expect(repository.deleteUserData).not.toHaveBeenCalled();
  });

  it('re-checks under the lock: someone joining meanwhile still blocks, nothing deleted', async () => {
    const { service, repository, events } = setup({
      workspaces: [ws('solo', USER_ID, 0)],
      lockedWorkspaces: [ws('solo', USER_ID, 1)],
    });
    await expectCode(
      service.deleteAccount(USER_ID, { password: PASSWORD }),
      'OWNED_SHARED_WORKSPACES',
      409,
    );
    expect(repository.findWorkspaces).toHaveBeenLastCalledWith(USER_ID, {
      db: { tag: 'trx' },
      lock: true,
    });
    expect(repository.deleteUserData).not.toHaveBeenCalled();
    expect(events).toEqual(['begin', 'rollback']);
  });

  it('deletes solo workspaces and leaves ones owned by others', async () => {
    const { service, repository, settle, storage } = setup({
      workspaces: [ws('solo', USER_ID, 0), ws('theirs', OTHER_ID, 2)],
    });
    const result = await service.deleteAccount(USER_ID, { password: PASSWORD });
    expect(result).toEqual({
      deleted: true,
      deletedWorkspaces: 1,
      leftWorkspaces: 1,
      subscriptionCancelled: false,
    });
    expect(repository.deleteUserData).toHaveBeenCalledWith(
      { tag: 'trx' },
      { userId: USER_ID, email: 'leaver@example.com', workspaceIds: ['solo'] },
    );
    await settle();
    expect(storage.deleteObjects).toHaveBeenCalledWith([{ bucket: 'receipts', key: 'solo/r.jpg' }]);
    expect(storage.deletePrefix).toHaveBeenCalledWith('avatars-bucket', `avatars/${USER_ID}/`);
  });
});

describe('AccountDeletionService.deleteAccount: subscriptions', () => {
  const paddleSub = (over: Partial<DeletableSubscription> = {}): DeletableSubscription => ({
    id: 's1',
    status: 'active',
    paymentProvider: 'paddle',
    merchantSubscriptionId: 'sub_01',
    ...over,
  });

  it('cancels an active Paddle subscription immediately, before deleting', async () => {
    const { service, paddle, events } = setup({ subscriptions: [paddleSub()] });
    const result = await service.deleteAccount(USER_ID, { password: PASSWORD });
    expect(paddle!.cancelSubscription).toHaveBeenCalledWith('sub_01', false);
    expect(result.subscriptionCancelled).toBe(true);
    expect(events).toEqual(['begin', 'paddle-cancel', 'delete', 'commit']);
  });

  it('aborts with 502 and deletes nothing when Paddle refuses', async () => {
    const { service, repository, events } = setup({
      subscriptions: [paddleSub()],
      paddle: {
        cancelSubscription: jest.fn(async () => {
          throw Object.assign(new Error('Paddle API error: boom'), { statusCode: 502 });
        }),
      },
    });
    await expectCode(
      service.deleteAccount(USER_ID, { password: PASSWORD }),
      'SUBSCRIPTION_CANCEL_FAILED',
      502,
    );
    expect(repository.deleteUserData).not.toHaveBeenCalled();
    expect(events).toEqual(['begin', 'rollback']);
  });

  it('aborts when Paddle is not configured but a subscription is live', async () => {
    const { service, repository } = setup({ subscriptions: [paddleSub()], paddle: null });
    await expectCode(
      service.deleteAccount(USER_ID, { password: PASSWORD }),
      'SUBSCRIPTION_CANCEL_FAILED',
      502,
    );
    expect(repository.deleteUserData).not.toHaveBeenCalled();
  });

  it("never touches a Paddle subscription that isn't SpendWise's for this user", async () => {
    const getSubscription = jest.fn(async (id: string) => ({
      id,
      status: 'active',
      custom_data: { app: 'bippass', userId: USER_ID },
    }));
    const { service, paddle, repository } = setup({
      subscriptions: [paddleSub()],
      paddle: { getSubscription },
    });
    const result = await service.deleteAccount(USER_ID, { password: PASSWORD });
    expect(paddle!.cancelSubscription).not.toHaveBeenCalled();
    expect(result.subscriptionCancelled).toBe(false);
    expect(repository.deleteUserData).toHaveBeenCalled();
  });

  it('skips subscriptions Paddle does not know, and ended or free ones', async () => {
    const getSubscription = jest.fn(async () => {
      throw Object.assign(new Error('not found'), { statusCode: 404 });
    });
    const { service, paddle } = setup({
      subscriptions: [
        paddleSub(),
        paddleSub({ id: 's2', status: 'cancelled', merchantSubscriptionId: 'sub_02' }),
        paddleSub({ id: 's3', paymentProvider: null, merchantSubscriptionId: null }),
      ],
      paddle: { getSubscription },
    });
    await service.deleteAccount(USER_ID, { password: PASSWORD });
    expect(getSubscription).toHaveBeenCalledTimes(1);
    expect(paddle!.cancelSubscription).not.toHaveBeenCalled();
  });

  it('does not cancel again when Paddle already shows it cancelled', async () => {
    const { service, paddle } = setup({
      subscriptions: [paddleSub()],
      paddle: {
        getSubscription: jest.fn(async (id: string) => ({
          id,
          status: 'canceled',
          custom_data: { app: 'spendwise', userId: USER_ID },
        })),
      },
    });
    await service.deleteAccount(USER_ID, { password: PASSWORD });
    expect(paddle!.cancelSubscription).not.toHaveBeenCalled();
  });
});

describe('AccountDeletionService.deleteAccount: after commit', () => {
  it('sends the confirmation email and clears cached codes', async () => {
    const { service, mailer, cache, settle } = setup();
    await service.deleteAccount(USER_ID, { password: PASSWORD });
    await settle();
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'leaver@example.com',
        subject: 'Your TrackMyPocket account was deleted',
      }),
    );
    expect(cache.del).toHaveBeenCalledWith(
      expect.arrayContaining([
        `2fa_attempts:${USER_ID}`,
        `2fa_pending:${USER_ID}:app`,
        'reset_code:leaver@example.com',
      ]),
    );
  });

  it('logs, and does not throw, when S3 or the mailer fail', async () => {
    const { service, mailer, logger, settle } = setup({ storageFails: true });
    mailer.send.mockResolvedValueOnce({ success: false, error: 'smtp down' } as any);
    const result = await service.deleteAccount(USER_ID, { password: PASSWORD });
    await expect(settle()).resolves.toBeDefined();
    expect(result.deleted).toBe(true);
    const warnings = logger.warn.mock.calls.map((c) => String(c[0]));
    expect(warnings.some((w) => w.includes('storage cleanup failed'))).toBe(true);
    expect(warnings.some((w) => w.includes('email cleanup failed'))).toBe(true);
    expect(warnings.join(' ')).not.toContain('leaver@example.com');
  });
});

describe('AccountDeletionService.preview', () => {
  it('says what to ask for and what will happen', async () => {
    const { service } = setup({
      user: makeUser('app'),
      workspaces: [ws('solo', USER_ID, 0), ws('shared', USER_ID, 2), ws('theirs', OTHER_ID, 1)],
      subscriptions: [
        { id: 's1', status: 'active', paymentProvider: 'paddle', merchantSubscriptionId: 'sub_1' },
      ],
    });
    expect(await service.preview(USER_ID)).toEqual({
      hasPassword: true,
      twoFactorEnabled: true,
      twoFactorMethods: ['authenticator'],
      workspacesToDelete: [{ id: 'solo', name: 'Workspace solo' }],
      workspacesToLeave: [{ id: 'theirs', name: 'Workspace theirs' }],
      blockingWorkspaces: [{ id: 'shared', name: 'Workspace shared', memberCount: 2 }],
      hasActiveSubscription: true,
    });
  });

  it('reports a Google-only account as having no password', async () => {
    const { service } = setup({ hasPassword: false });
    expect((await service.preview(USER_ID)).hasPassword).toBe(false);
  });
});

describe('AccountDeletionRepository', () => {
  const fakeDb = () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
        if (sql.includes('FROM workspaces w')) {
          return { rows: [{ id: 'w1', name: 'Home', owner_id: USER_ID, other_members: '2' }] };
        }
        return { rows: [], rowCount: sql.startsWith('DELETE FROM users') ? 1 : 0 };
      }),
    };
    return { db, calls };
  };

  it('locks the workspace rows only when asked', async () => {
    const { db, calls } = fakeDb();
    const repo = new AccountDeletionRepository(db as any);
    expect(await repo.findWorkspaces(USER_ID)).toEqual([
      { id: 'w1', name: 'Home', ownerId: USER_ID, otherMembers: 2 },
    ]);
    await repo.findWorkspaces(USER_ID, { lock: true });
    expect(calls[0].sql).not.toContain('FOR UPDATE');
    expect(calls[1].sql).toContain('FOR UPDATE OF w');
  });

  it('deletes only owned workspaces, anonymises shared history, then the user', async () => {
    const { db, calls } = fakeDb();
    const repo = new AccountDeletionRepository(db as any);
    const result = await repo.deleteUserData(db as any, {
      userId: USER_ID,
      email: 'Leaver@Example.com',
      workspaceIds: ['w1'],
    });
    const statements = calls.map((c) => c.sql.split(' WHERE ')[0]);
    expect(statements).toEqual([
      'DELETE FROM activity_logs',
      'DELETE FROM transactions_archive',
      'DELETE FROM workspaces',
      "UPDATE activity_logs SET user_id = NULL, metadata = COALESCE(metadata, '{}'::jsonb) - 'ip' - 'userAgent'",
      'UPDATE transactions_archive SET user_id = NULL',
      'DELETE FROM workspace_invitations',
      'DELETE FROM workspace_members',
      'DELETE FROM users',
    ]);
    expect(calls[2].sql).toContain('owner_id = $2');
    expect(calls[2].params).toEqual([['w1'], USER_ID]);
    expect(result.users).toBe(1);
  });

  it('skips the workspace statements when there are none', async () => {
    const { db, calls } = fakeDb();
    const repo = new AccountDeletionRepository(db as any);
    await repo.deleteUserData(db as any, { userId: USER_ID, email: 'a@b.c', workspaceIds: [] });
    expect(calls.some((c) => c.sql.startsWith('DELETE FROM workspaces'))).toBe(false);
  });
});

describe('generateAccountDeletedEmail', () => {
  it('escapes names in the HTML', () => {
    const email = generateAccountDeletedEmail({
      firstName: 'Lee',
      deletedWorkspaces: ['<b>Home</b>'],
      leftWorkspaces: [],
      subscriptionCancelled: true,
    });
    expect(email.html).toContain('&lt;b&gt;Home&lt;/b&gt;');
    expect(email.text).toContain('subscription was cancelled');
  });
});

describe('DELETE /auth/account (router)', () => {
  const bearer = (userId = USER_ID) =>
    `Bearer ${jwt.sign({ userId, purpose: 'access' }, JWT_SECRET, { expiresIn: '15m' })}`;

  const buildApp = (service: Partial<AccountDeletionService>) => {
    mockRedis.current = createFakeRedis();
    const controller = new AccountDeletionController(async () => service as AccountDeletionService);
    const app = express();
    app.use(express.json());
    app.use('/api/v1/auth/account', createAccountDeletionRouter(controller));
    return app;
  };

  it('requires a session', async () => {
    const app = buildApp({ deleteAccount: jest.fn() });
    const res = await request(app).delete('/api/v1/auth/account').send({ password: 'x' });
    expect(res.status).toBe(401);
  });

  it('returns the summary on success', async () => {
    const deleteAccount = jest.fn(async () => ({
      deleted: true as const,
      deletedWorkspaces: 1,
      leftWorkspaces: 0,
      subscriptionCancelled: false,
    }));
    const app = buildApp({ deleteAccount });
    const res = await request(app)
      .delete('/api/v1/auth/account')
      .set('Authorization', bearer())
      .send({ password: PASSWORD, extra: 'dropped' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        deleted: true,
        deletedWorkspaces: 1,
        leftWorkspaces: 0,
        subscriptionCancelled: false,
      },
    });
    expect(deleteAccount).toHaveBeenCalledWith(USER_ID, { password: PASSWORD });
  });

  it('answers 409 with the code and the blocking workspaces', async () => {
    const app = buildApp({
      deleteAccount: jest.fn(async () => {
        throw new AccountDeletionError('blocked', 409, 'OWNED_SHARED_WORKSPACES', [
          { id: 'w1', name: 'Family', memberCount: 2 },
        ]);
      }),
    });
    const res = await request(app)
      .delete('/api/v1/auth/account')
      .set('Authorization', bearer())
      .send({ password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      message: 'blocked',
      code: 'OWNED_SHARED_WORKSPACES',
      workspaces: [{ id: 'w1', name: 'Family', memberCount: 2 }],
    });
  });

  it('rejects a malformed 2FA code before reaching the service', async () => {
    const deleteAccount = jest.fn();
    const app = buildApp({ deleteAccount });
    const res = await request(app)
      .delete('/api/v1/auth/account')
      .set('Authorization', bearer())
      .send({ password: PASSWORD, twoFactorCode: '12ab' });
    expect(res.status).toBe(400);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('allows five attempts per user per 15 minutes', async () => {
    const deleteAccount = jest.fn(async () => {
      throw new AccountDeletionError('Incorrect password', 400, 'INVALID_PASSWORD');
    });
    const app = buildApp({ deleteAccount });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .delete('/api/v1/auth/account')
        .set('Authorization', bearer())
        .send({ password: 'nope' });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
    // Another user has their own budget.
    const other = await request(app)
      .delete('/api/v1/auth/account')
      .set('Authorization', bearer(OTHER_ID))
      .send({ password: 'nope' });
    expect(other.status).toBe(400);
  });

  it('serves the preview without caching', async () => {
    const preview = jest.fn(async () => ({ hasPassword: false }) as any);
    const app = buildApp({ preview });
    const res = await request(app)
      .get('/api/v1/auth/account/deletion-preview')
      .set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { hasPassword: false } });
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
