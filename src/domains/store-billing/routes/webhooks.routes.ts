import { Router, Request, Response, NextFunction } from 'express';
import { getRevenueCatWebhookHandler } from '../storeBilling';

/**
 * Inbound webhooks authenticated by a shared secret (mounted at /v1/webhooks).
 * Public: no session; RevenueCat sends the configured Authorization header.
 */
const router = Router();

router.post('/revenuecat', (req: Request, res: Response, next: NextFunction) =>
  getRevenueCatWebhookHandler().handle(req, res).catch(next),
);

export default router;
