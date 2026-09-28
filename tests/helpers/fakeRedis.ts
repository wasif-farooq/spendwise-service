/**
 * In-memory stand-in for the subset of node-redis the auth code uses, with
 * TTLs driven by a controllable clock so expiry can be tested without waiting.
 */
export interface FakeRedis {
  store: Map<string, { value: string; expiresAt: number | null }>;
  now: number;
  advance(seconds: number): void;
  ttl(key: string): number | null;
  get(key: string): Promise<string | null>;
  getDel(key: string): Promise<string | null>;
  set(key: string, value: string, options?: any): Promise<'OK' | null>;
  del(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

export const createFakeRedis = (): FakeRedis => {
  const redis: FakeRedis = {
    store: new Map(),
    now: 1_700_000_000_000,

    advance(seconds: number) {
      redis.now += seconds * 1000;
    },

    ttl(key: string) {
      const entry = live(key);
      if (!entry || entry.expiresAt === null) return null;
      return Math.round((entry.expiresAt - redis.now) / 1000);
    },

    async get(key) {
      return live(key)?.value ?? null;
    },

    async getDel(key) {
      const entry = live(key);
      redis.store.delete(key);
      return entry?.value ?? null;
    },

    async set(key, value, options = {}) {
      const exists = Boolean(live(key));
      const condition = options.condition ?? (options.NX ? 'NX' : options.XX ? 'XX' : undefined);
      if (condition === 'NX' && exists) return null;
      if (condition === 'XX' && !exists) return null;

      const seconds =
        options.expiration?.type === 'EX' ? options.expiration.value : (options.EX ?? null);
      redis.store.set(key, {
        value,
        expiresAt: seconds ? redis.now + seconds * 1000 : null,
      });
      return 'OK';
    },

    async del(key) {
      return redis.store.delete(key) ? 1 : 0;
    },

    async incr(key) {
      const entry = live(key);
      const next = Number(entry?.value ?? 0) + 1;
      redis.store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
      return next;
    },

    async expire(key, seconds) {
      const entry = live(key);
      if (!entry) return 0;
      entry.expiresAt = redis.now + seconds * 1000;
      return 1;
    },
  };

  function live(key: string) {
    const entry = redis.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= redis.now) {
      redis.store.delete(key);
      return undefined;
    }
    return entry;
  }

  return redis;
};
