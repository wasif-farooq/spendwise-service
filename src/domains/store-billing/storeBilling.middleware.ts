import { Request, Response, NextFunction } from 'express';
import { createRateLimiter } from '@shared/middleware/rateLimit.middleware';
import { createStoreSubscriptionService, findCurrentSubscriptionRow } from './storeBilling';
import { SubscriptionRow } from './StoreSubscriptionRepository';
import {
  billingFieldsOf,
  assertNotManagedByGooglePlay,
  storeBillingErrorBody,
  STORE_BILLING_ERRORS,
} from './subscriptionSource';
import { StoreSubscriptionService } from './StoreSubscriptionService';

const userIdOf = (req: Request): string | undefined =>
  (req as any).user?.userId || (req as any).user?.id || (req as any).user?.sub;

/**
 * 409 SUBSCRIPTION_MANAGED_BY_GOOGLE_PLAY before the web checkout, plan changes and
 * cancel while Google Play bills the user (see subscriptionSource.ts). Must run after
 * requireAuth. Errors reading the row fall through to the route (fail open: the route
 * has its own checks, and the store purchase is unaffected).
 */
export const rejectIfManagedByGooglePlay =
  (lookup: (userId: string) => Promise<SubscriptionRow | null> = findCurrentSubscriptionRow) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = userIdOf(req);
    if (!userId) return next();
    let row: SubscriptionRow | null;
    try {
      row = await lookup(userId);
    } catch (error) {
      console.error('[StoreBilling] could not read the subscription for the biller check', error);
      return next();
    }
    try {
      assertNotManagedByGooglePlay(row);
    } catch (error) {
      const body = storeBillingErrorBody(error);
      if (body) return res.status(409).json(body);
      return next(error);
    }
    return next();
  };

/** 20 syncs per user per 15 minutes: after a purchase, a restore, and a few retries. */
export const storeSyncRateLimit = createRateLimiter({
  bucket: 'store-sync',
  max: 20,
  windowSeconds: 15 * 60,
  message: 'Too many purchase checks. Please try again in a few minutes.',
  code: STORE_BILLING_ERRORS.TOO_MANY_SYNCS,
  keyGenerator: (req) => userIdOf(req) || req.ip || 'unknown',
});

/**
 * POST /subscription/sync: re-read the user's store purchases from RevenueCat and apply
 * them. 200 { synced, outcome, subscription: billing fields }.
 */
export const syncStoreSubscriptionHandler =
  (
    getService: () => Pick<
      StoreSubscriptionService,
      'syncOrConflict'
    > = createStoreSubscriptionService,
    lookup: (userId: string) => Promise<SubscriptionRow | null> = findCurrentSubscriptionRow,
  ) =>
  async (req: Request, res: Response) => {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ message: 'User not authenticated' });
    try {
      const result = await getService().syncOrConflict(userId);
      const row = await lookup(userId);
      return res.json({
        synced: true,
        outcome: result.outcome,
        subscription: {
          plan: row?.planKey ?? 'free',
          status: row?.status ?? 'active',
          ...billingFieldsOf(row),
        },
      });
    } catch (error: any) {
      const body = storeBillingErrorBody(error);
      if (body) return res.status(error.statusCode).json(body);
      console.error('[StoreBilling] sync failed', error);
      return res.status(500).json({ message: 'Could not check your purchase' });
    }
  };
