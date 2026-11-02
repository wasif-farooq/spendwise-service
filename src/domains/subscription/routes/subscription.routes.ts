import { Router, Request, Response } from 'express';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { SubscriptionControllerFactory } from '@factories/SubscriptionControllerFactory';
import {
  rejectIfManagedByGooglePlay,
  storeSyncRateLimit,
  syncStoreSubscriptionHandler,
} from '@domains/store-billing/storeBilling.middleware';

const router = Router();
const factory = new SubscriptionControllerFactory();
const controller = factory.create();

// Public endpoint - visible to unauthenticated users (for signup page)
router.get('/plans', controller.getPlans.bind(controller));

// Protected endpoints - require authentication
router.use(requireAuth);

router.get('/current', controller.getCurrentSubscription.bind(controller));
// While Google Play bills the plan it's changed and cancelled in Google Play (409).
const notStoreManaged = rejectIfManagedByGooglePlay();
router.post('/upgrade', notStoreManaged, controller.upgrade.bind(controller));
router.post('/downgrade', notStoreManaged, controller.downgrade.bind(controller));
router.post('/cancel', notStoreManaged, controller.cancel.bind(controller));
// Re-read the user's Google Play purchase from RevenueCat right after buying/restoring.
router.post('/sync', storeSyncRateLimit, syncStoreSubscriptionHandler());
router.get('/usage', controller.getFeatureUsage.bind(controller));
router.get('/workspace/:workspaceId/current', controller.getWorkspaceSubscription.bind(controller));
router.get('/check-access/:feature', (req: Request, res: Response) => {
  return res.json({ hasAccess: true });
});

export default router;
