import { Router, Request, Response } from 'express';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { SubscriptionController } from  '@domains/subscription/controllers/SubscriptionController';

const router = Router();
const controller = new SubscriptionController();

// All routes require authentication
router.use(requireAuth);

router.get('/current', controller.getCurrentSubscription.bind(controller));
router.get('/plans', controller.getPlans.bind(controller));
router.post('/upgrade', controller.upgrade.bind(controller));
router.post('/downgrade', controller.downgrade.bind(controller));
router.get('/usage', controller.getFeatureUsage.bind(controller));
router.get('/check-access/:feature', (req: Request, res: Response) => {
    // Basic check for now
    return res.json({ hasAccess: true });
});

export default router;
