import { Request, Response, NextFunction } from 'express';
import { ServiceFactory } from '@factories/ServiceFactory';

/**
 * Fixed-window rate limiting, backed by Redis so the limit holds across
 * every API replica rather than per-process.
 *
 * Counting uses INCR + EXPIRE: the first hit in a window sets the TTL, and
 * the key disappears when the window closes.
 */

export interface RateLimitStore {
  /** Register a hit and return the running count for the current window. */
  hit(key: string, windowSeconds: number): Promise<number>;
}

export interface RateLimitOptions {
  /** Namespace for the counter, e.g. 'login'. Keeps buckets independent. */
  bucket: string;
  /** Requests allowed per window. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Message returned once the limit is hit. */
  message?: string;
  /** Derive the identity being limited. Defaults to the client IP. */
  keyGenerator?: (req: Request) => string;
}

class RedisRateLimitStore implements RateLimitStore {
  async hit(key: string, windowSeconds: number): Promise<number> {
    const client = await ServiceFactory.getSharedRedisClient();
    if (!client) {
      throw new Error('Redis unavailable');
    }

    const count = await client.incr(key);
    // Only the first hit in a window sets the expiry, so the window does not
    // slide forward on every request.
    if (count === 1) {
      await client.expire(key, windowSeconds);
    }

    return count;
  }
}

const defaultStore = new RedisRateLimitStore();

/**
 * Identify the caller. Express resolves `req.ip` from X-Forwarded-For only
 * when `trust proxy` is configured — see Server.configureMiddleware.
 */
const clientIp = (req: Request): string => req.ip || req.socket?.remoteAddress || 'unknown';

export const createRateLimiter = (
  options: RateLimitOptions,
  store: RateLimitStore = defaultStore,
) => {
  const {
    bucket,
    max,
    windowSeconds,
    message = 'Too many requests. Please try again later.',
    keyGenerator = clientIp,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    let count: number;

    try {
      count = await store.hit(`ratelimit:${bucket}:${keyGenerator(req)}`, windowSeconds);
    } catch (error) {
      // Fail open: a Redis outage should not take down sign-in entirely.
      // This does mean brute-force protection is only as available as Redis,
      // so the failure is logged loudly rather than swallowed.
      console.error(
        `[RateLimit] store unavailable for bucket "${bucket}", allowing request`,
        error,
      );
      return next();
    }

    const remaining = Math.max(0, max - count);
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);

    if (count > max) {
      res.setHeader('Retry-After', windowSeconds);
      return res.status(429).json({ message });
    }

    return next();
  };
};

/**
 * Limits for credential-handling endpoints. These are deliberately far
 * tighter than any legitimate client needs — they exist to make online
 * guessing of passwords, reset codes and 2FA codes impractical.
 */
export const authRateLimits = {
  login: createRateLimiter({
    bucket: 'login',
    max: 10,
    windowSeconds: 15 * 60,
    message: 'Too many sign-in attempts. Please try again in a few minutes.',
  }),

  register: createRateLimiter({
    bucket: 'register',
    max: 5,
    windowSeconds: 60 * 60,
    message: 'Too many accounts created from this address. Please try again later.',
  }),

  passwordReset: createRateLimiter({
    bucket: 'password-reset',
    max: 5,
    windowSeconds: 60 * 60,
    message: 'Too many password reset requests. Please try again later.',
  }),

  /**
   * Guards the code-checking endpoints. AuthService additionally throttles
   * per user, so this bounds an attacker spreading guesses across accounts.
   */
  codeVerification: createRateLimiter({
    bucket: 'code-verification',
    max: 15,
    windowSeconds: 15 * 60,
    message: 'Too many verification attempts. Please try again in a few minutes.',
  }),

  /**
   * Changing a password checks the current one, so it is a credential-guessing
   * surface even behind a session. Given its own bucket so a user changing
   * their password does not consume the code-verification budget.
   */
  passwordChange: createRateLimiter({
    bucket: 'password-change',
    max: 10,
    windowSeconds: 15 * 60,
    message: 'Too many password change attempts. Please try again in a few minutes.',
  }),

  /** Resending a code sends an email/SMS, so it is kept deliberately scarce. */
  codeResend: createRateLimiter({
    bucket: 'code-resend',
    max: 5,
    windowSeconds: 15 * 60,
    message: 'Too many code requests. Please wait before requesting another.',
  }),

  /**
   * Issuing a handoff code needs a session, so it is keyed by user rather
   * than IP. A user opens checkout a handful of times at most.
   */
  handoffIssue: createRateLimiter({
    bucket: 'handoff-issue',
    max: 20,
    windowSeconds: 15 * 60,
    message: 'Too many handoff requests. Please try again in a few minutes.',
    keyGenerator: (req) => {
      const user = (req as any).user;
      return user?.userId || user?.sub || clientIp(req);
    },
  }),

  /**
   * Exchanging a code mints a session. Codes are 256-bit so guessing is not
   * realistic, but the endpoint is still bounded per IP.
   */
  handoffExchange: createRateLimiter({
    bucket: 'handoff-exchange',
    max: 20,
    windowSeconds: 15 * 60,
    message: 'Too many sign-in attempts. Please try again in a few minutes.',
  }),

  /**
   * Deleting the account checks the password and a 2FA code, so it is a guessing
   * surface behind a session. Keyed by user: someone holding a stolen access token
   * gets a handful of tries, whatever IPs they use.
   */
  accountDeletion: createRateLimiter({
    bucket: 'account-deletion',
    max: 5,
    windowSeconds: 15 * 60,
    message: 'Too many attempts to delete the account. Please try again in a few minutes.',
    keyGenerator: (req) => {
      const user = (req as any).user;
      return user?.userId || user?.sub || clientIp(req);
    },
  }),

  /** Legitimate clients refresh regularly, so this is generous. */
  refresh: createRateLimiter({
    bucket: 'refresh',
    max: 60,
    windowSeconds: 15 * 60,
  }),
};
