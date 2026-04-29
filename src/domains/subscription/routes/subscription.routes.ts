import { Router, Request, Response } from 'express';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { SubscriptionControllerFactory } from '@factories/SubscriptionControllerFactory';

const router = Router();
const factory = new SubscriptionControllerFactory();
const controller = factory.create();

// All routes require authentication
router.use(requireAuth);

router.get('/current', controller.getCurrentSubscription.bind(controller));
router.get('/plans', controller.getPlans.bind(controller));
router.post('/upgrade', controller.upgrade.bind(controller));
router.post('/downgrade', controller.downgrade.bind(controller));
router.post('/cancel', controller.cancel.bind(controller));
router.get('/usage', controller.getFeatureUsage.bind(controller));
router.get('/check-access/:feature', (req: Request, res: Response) => {
    // Basic check for now
    return res.json({ hasAccess: true });
});

export default router;
