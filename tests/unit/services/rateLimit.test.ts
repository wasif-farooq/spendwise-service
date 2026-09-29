import { Request, Response } from 'express';
import { createRateLimiter, RateLimitStore } from '@shared/middleware/rateLimit.middleware';

/** In-memory stand-in for the Redis store, with the same fixed-window shape. */
const memoryStore = (): RateLimitStore & { counts: Map<string, number> } => {
  const counts = new Map<string, number>();
  return {
    counts,
    async hit(key: string) {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
  };
};

const buildReq = (ip = '203.0.113.5'): Request => ({ ip, socket: {} }) as unknown as Request;

const buildRes = () => {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, unknown>,
    body: undefined,
    setHeader(name: string, value: unknown) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as Response & { statusCode: number; headers: Record<string, any>; body: any };
};

describe('createRateLimiter', () => {
  it('allows requests up to the limit', async () => {
    const limiter = createRateLimiter({ bucket: 'test', max: 3, windowSeconds: 60 }, memoryStore());
    const next = jest.fn();

    for (let i = 0; i < 3; i++) {
      await limiter(buildReq(), buildRes(), next);
    }

    expect(next).toHaveBeenCalledTimes(3);
  });

  it('blocks with 429 once the limit is exceeded', async () => {
    const limiter = createRateLimiter({ bucket: 'test', max: 2, windowSeconds: 60 }, memoryStore());
    const next = jest.fn();

    await limiter(buildReq(), buildRes(), next);
    await limiter(buildReq(), buildRes(), next);

    const res = buildRes();
    await limiter(buildReq(), res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe(60);
  });

  it('reports remaining quota', async () => {
    const limiter = createRateLimiter({ bucket: 'test', max: 5, windowSeconds: 60 }, memoryStore());
    const res = buildRes();

    await limiter(buildReq(), res, jest.fn());

    expect(res.headers['RateLimit-Limit']).toBe(5);
    expect(res.headers['RateLimit-Remaining']).toBe(4);
  });

  it('counts each client IP separately', async () => {
    const limiter = createRateLimiter({ bucket: 'test', max: 1, windowSeconds: 60 }, memoryStore());
    const next = jest.fn();

    await limiter(buildReq('198.51.100.1'), buildRes(), next);
    await limiter(buildReq('198.51.100.2'), buildRes(), next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('keeps buckets independent', async () => {
    const store = memoryStore();
    const login = createRateLimiter({ bucket: 'login', max: 1, windowSeconds: 60 }, store);
    const reset = createRateLimiter({ bucket: 'reset', max: 1, windowSeconds: 60 }, store);
    const next = jest.fn();

    await login(buildReq(), buildRes(), next);
    await reset(buildReq(), buildRes(), next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('honours a custom key generator', async () => {
    const store = memoryStore();
    const limiter = createRateLimiter(
      {
        bucket: 'test',
        max: 10,
        windowSeconds: 60,
        keyGenerator: () => 'fixed-key',
      },
      store,
    );

    await limiter(buildReq('198.51.100.1'), buildRes(), jest.fn());
    await limiter(buildReq('198.51.100.2'), buildRes(), jest.fn());

    expect(store.counts.get('ratelimit:test:fixed-key')).toBe(2);
  });

  it('fails open when the store is unavailable', async () => {
    const brokenStore: RateLimitStore = {
      hit: async () => {
        throw new Error('Redis down');
      },
    };
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const limiter = createRateLimiter({ bucket: 'test', max: 1, windowSeconds: 60 }, brokenStore);
    const next = jest.fn();
    const res = buildRes();

    await limiter(buildReq(), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('returns the configured message', async () => {
    const limiter = createRateLimiter(
      { bucket: 'test', max: 1, windowSeconds: 60, message: 'slow down' },
      memoryStore(),
    );

    await limiter(buildReq(), buildRes(), jest.fn());
    const res = buildRes();
    await limiter(buildReq(), res, jest.fn());

    expect(res.body).toEqual({ message: 'slow down' });
  });

  it('adds the configured code and keys by user when asked', async () => {
    const limiter = createRateLimiter(
      {
        bucket: 'scan',
        max: 1,
        windowSeconds: 3600,
        message: 'too many scans',
        code: 'TOO_MANY_SCANS',
        keyGenerator: (req) => (req as any).user.userId,
      },
      memoryStore(),
    );
    const as = (userId: string, ip: string) =>
      ({ ...buildReq(ip), user: { userId } }) as unknown as Request;

    await limiter(as('u1', '198.51.100.1'), buildRes(), jest.fn());
    const sameUserOtherIp = buildRes();
    await limiter(as('u1', '198.51.100.2'), sameUserOtherIp, jest.fn());
    const otherUser = buildRes();
    await limiter(as('u2', '198.51.100.1'), otherUser, jest.fn());

    expect(sameUserOtherIp.statusCode).toBe(429);
    expect(sameUserOtherIp.body).toEqual({ message: 'too many scans', code: 'TOO_MANY_SCANS' });
    expect(otherUser.statusCode).toBe(200);
  });
});
