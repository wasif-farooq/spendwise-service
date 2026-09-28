import jwt from 'jsonwebtoken';
import { AuthService } from '@domains/auth/services/AuthService';
import {
  HANDOFF_INVALID_MESSAGE,
  HANDOFF_TTL_SECONDS,
  handoffKey,
  hashHandoffCode,
  parseHandoffRecord,
} from '@domains/auth/services/AuthHandoff';
import { User } from '@domains/auth/models/User';
import { AppError } from '@shared/errors/AppError';
import { createFakeRedis, FakeRedis } from '../../helpers/fakeRedis';

const JWT_SECRET = 'unit-test-secret';

jest.mock('@config/ConfigLoader', () => ({
  ConfigLoader: {
    getInstance: () => ({
      get: (key: string) => {
        const values: Record<string, any> = {
          'auth.jwt.secret': 'unit-test-secret',
          'auth.jwt.accessTokenExpiry': '15m',
          'auth.jwt.refreshTokenExpiry': '7d',
        };
        return values[key];
      },
    }),
  },
}));

const USER_ID = '22222222-2222-4222-8222-222222222222';

const buildUser = (): User =>
  User.restore(
    {
      email: 'handoff@example.com',
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

const buildService = (user: User | null, cache?: FakeRedis) => {
  const userRepo = {
    findById: jest.fn().mockImplementation(async (id: string) => (user && id === user.id ? user : null)),
    findByEmail: jest.fn(),
    save: jest.fn(),
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
    cache,
  );
  return { service, userRepo };
};

const expectAppError = async (promise: Promise<unknown>, status: number, message?: string) => {
  const error = await promise.then(
    () => null,
    (e) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect(error.statusCode).toBe(status);
  if (message) expect(error.message).toBe(message);
};

describe('AuthService handoff: issue', () => {
  let redis: FakeRedis;

  beforeEach(() => {
    redis = createFakeRedis();
  });

  it('returns a high-entropy URL-safe code with a 60 second life', async () => {
    const { service } = buildService(buildUser(), redis);

    const result = await service.issueHandoffCode(USER_ID, 'checkout');

    // 32 random bytes in base64url is 43 characters, i.e. 256 bits.
    expect(result.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expiresIn).toBe(60);
    expect(result.scope).toBe('checkout');
    expect(redis.ttl(handoffKey(result.code))).toBe(HANDOFF_TTL_SECONDS);
  });

  it('stores only a hash of the code, bound to the user and scope', async () => {
    const { service } = buildService(buildUser(), redis);

    const { code } = await service.issueHandoffCode(USER_ID, 'checkout');

    const keys = [...redis.store.keys()];
    expect(keys).toEqual([`auth_handoff:${hashHandoffCode(code)}`]);
    const stored = redis.store.get(keys[0])!.value;
    expect(stored).not.toContain(code);
    expect(keys[0]).not.toContain(code);
    expect(parseHandoffRecord(stored)).toMatchObject({ userId: USER_ID, scope: 'checkout' });
  });

  it('issues a different code every time', async () => {
    const { service } = buildService(buildUser(), redis);
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add((await service.issueHandoffCode(USER_ID, 'checkout')).code);
    }
    expect(codes.size).toBe(50);
  });

  it('rejects an unknown scope', async () => {
    const { service } = buildService(buildUser(), redis);
    await expectAppError(service.issueHandoffCode(USER_ID, 'admin' as any), 400);
    expect(redis.store.size).toBe(0);
  });

  it('rejects a user that no longer exists', async () => {
    const { service } = buildService(null, redis);
    await expectAppError(service.issueHandoffCode(USER_ID, 'checkout'), 401);
  });

  it('fails closed without Redis', async () => {
    const { service } = buildService(buildUser());
    await expectAppError(service.issueHandoffCode(USER_ID, 'checkout'), 503);
  });
});

describe('AuthService handoff: exchange', () => {
  let redis: FakeRedis;

  beforeEach(() => {
    redis = createFakeRedis();
  });

  it('exchanges a fresh code for a login-shaped token pair', async () => {
    const { service } = buildService(buildUser(), redis);
    const { code } = await service.issueHandoffCode(USER_ID, 'checkout');

    const result = await service.exchangeHandoffCode(code);

    expect(Object.keys(result).sort()).toEqual(['refreshToken', 'token', 'user']);
    expect(result.user.id).toBe(USER_ID);
    const access = jwt.verify(result.token, JWT_SECRET) as any;
    const refresh = jwt.verify(result.refreshToken, JWT_SECRET) as any;
    expect(access).toMatchObject({ userId: USER_ID, purpose: 'access' });
    expect(refresh).toMatchObject({ userId: USER_ID, purpose: 'refresh' });
  });

  it('works only once (the code is deleted on exchange)', async () => {
    const { service } = buildService(buildUser(), redis);
    const { code } = await service.issueHandoffCode(USER_ID, 'checkout');

    await service.exchangeHandoffCode(code);

    expect(redis.store.size).toBe(0);
    await expectAppError(service.exchangeHandoffCode(code), 401, HANDOFF_INVALID_MESSAGE);
  });

  it('lets only one of two concurrent exchanges succeed', async () => {
    const { service } = buildService(buildUser(), redis);
    const { code } = await service.issueHandoffCode(USER_ID, 'checkout');

    const results = await Promise.allSettled([
      service.exchangeHandoffCode(code),
      service.exchangeHandoffCode(code),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('rejects a code after 60 seconds', async () => {
    const { service } = buildService(buildUser(), redis);
    const { code } = await service.issueHandoffCode(USER_ID, 'checkout');

    redis.advance(HANDOFF_TTL_SECONDS);

    await expectAppError(service.exchangeHandoffCode(code), 401, HANDOFF_INVALID_MESSAGE);
  });

  it('still accepts a code just inside its lifetime', async () => {
    const { service } = buildService(buildUser(), redis);
    const { code } = await service.issueHandoffCode(USER_ID, 'checkout');

    redis.advance(HANDOFF_TTL_SECONDS - 1);

    await expect(service.exchangeHandoffCode(code)).resolves.toHaveProperty('token');
  });

  it('gives the same generic error for a wrong, empty or tampered code', async () => {
    const { service } = buildService(buildUser(), redis);
    const { code } = await service.issueHandoffCode(USER_ID, 'checkout');

    const flipped = (code[0] === 'A' ? 'B' : 'A') + code.slice(1);
    await expectAppError(service.exchangeHandoffCode(flipped), 401, HANDOFF_INVALID_MESSAGE);
    await expectAppError(service.exchangeHandoffCode('not-a-code'), 401, HANDOFF_INVALID_MESSAGE);
    await expectAppError(service.exchangeHandoffCode(''), 401, HANDOFF_INVALID_MESSAGE);
    // A wrong guess must not burn the real code.
    await expect(service.exchangeHandoffCode(code)).resolves.toHaveProperty('token');
  });

  it('does not accept the stored hash in place of the code', async () => {
    const { service } = buildService(buildUser(), redis);
    const { code } = await service.issueHandoffCode(USER_ID, 'checkout');

    await expectAppError(
      service.exchangeHandoffCode(hashHandoffCode(code)),
      401,
      HANDOFF_INVALID_MESSAGE,
    );
  });

  it('rejects a code whose user was deleted, with the same error', async () => {
    const issuer = buildService(buildUser(), redis);
    const { code } = await issuer.service.issueHandoffCode(USER_ID, 'checkout');

    const { service } = buildService(null, redis);
    await expectAppError(service.exchangeHandoffCode(code), 401, HANDOFF_INVALID_MESSAGE);
  });

  it('rejects a malformed stored record', async () => {
    const { service } = buildService(buildUser(), redis);
    await redis.set(handoffKey('planted'), JSON.stringify({ userId: USER_ID, scope: 'admin' }));

    await expectAppError(service.exchangeHandoffCode('planted'), 401, HANDOFF_INVALID_MESSAGE);
  });

  it('fails closed without Redis', async () => {
    const { service } = buildService(buildUser());
    await expectAppError(service.exchangeHandoffCode('anything'), 503);
  });
});
