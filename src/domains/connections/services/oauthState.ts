import { randomBytes } from 'crypto';
import type { CacheFacade } from '@facades/CacheFacade';

/**
 * The `state` of an OAuth sign-in: a random value that ties the provider's
 * redirect back to the user, workspace and provider that started it. It is
 * good for ten minutes and for one use.
 */
export interface OAuthState {
  workspaceId: string;
  userId: string;
  provider: string;
  /** Where the callback page sends the user afterwards. */
  returnTo: 'web' | 'mobile';
}

export const OAUTH_STATE_TTL_SECONDS = 600;

export interface OAuthStateStore {
  put(state: string, value: OAuthState, ttlSeconds: number): Promise<void>;
  /** Reads and removes it; null when unknown, expired or already used. */
  take(state: string): Promise<OAuthState | null>;
}

export const newOAuthState = (): string => randomBytes(32).toString('base64url');

const key = (state: string) => `connections:oauth-state:${state}`;

/** Redis-backed, shared by every API process. */
export const cacheOAuthStateStore = (cache: CacheFacade): OAuthStateStore => ({
  async put(state, value, ttlSeconds) {
    await cache.set(key(state), value, ttlSeconds);
  },
  async take(state) {
    const value = await cache.get<OAuthState>(key(state));
    if (!value || typeof value !== 'object') return null;
    await cache.del(key(state));
    return value;
  },
});

/** For a single process without a cache, and for tests. */
export const memoryOAuthStateStore = (now: () => number = Date.now): OAuthStateStore => {
  const states = new Map<string, { value: OAuthState; expiresAt: number }>();
  return {
    async put(state, value, ttlSeconds) {
      for (const [k, entry] of states) if (entry.expiresAt <= now()) states.delete(k);
      states.set(state, { value, expiresAt: now() + ttlSeconds * 1000 });
    },
    async take(state) {
      const entry = states.get(state);
      states.delete(state);
      return entry && entry.expiresAt > now() ? entry.value : null;
    },
  };
};
