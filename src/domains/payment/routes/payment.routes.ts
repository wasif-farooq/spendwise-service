import { Router, Request, Response, NextFunction } from 'express';
import { TOKENS } from '@di/tokens';
import { controllerMiddleware } from '@shared/middlewares/controller.middleware';
import { getStripeWebhookHandler } from '../webhooks/StripeWebhookHandler';
import { getPaddleWebhookHandler } from '../webhooks/PaddleWebhookHandler';

const router = Router();

/**
 * Absolute paths of the Stripe webhook endpoints.
 *
 * Stripe signs the exact bytes it sent, so these paths must receive the
 * unparsed body. Server.configureMiddleware installs express.raw() for them
 * ahead of the JSON parser — keep this list in sync with the routes below and
 * with where ApiRouter mounts this router (/api + /v1/payment).
 */
export const STRIPE_WEBHOOK_PATHS = [
  '/api/v1/payment/webhook/stripe',
  '/api/v1/payment/webhooks/stripe',
];

/**
 * Paddle signs `${ts}:${rawBody}`, so like Stripe it needs the unparsed body. Public
 * (unauthenticated) via the '/payment/webhook' prefix in auth.middleware.
 */
export const PADDLE_WEBHOOK_PATHS = ['/api/v1/payment/webhook/paddle'];

/** Every path Server.configureMiddleware must hand to express.raw(). */
export const RAW_BODY_WEBHOOK_PATHS = [...STRIPE_WEBHOOK_PATHS, ...PADDLE_WEBHOOK_PATHS];

router.use(controllerMiddleware(TOKENS.PaymentControllerFactory));

router.get('/gateways', (req, res, next) => req.controller.getGateways(req, res).catch(next));
router.post('/checkout', (req, res, next) => req.controller.createCheckout(req, res).catch(next));
router.post('/paddle/confirm', (req, res, next) =>
  req.controller.confirmPaddle(req, res).catch(next),
);

const handleStripeWebhook = (req: Request, res: Response, next: NextFunction) =>
  getStripeWebhookHandler().handleWebhook(req, res).catch(next);

router.post('/webhook/stripe', handleStripeWebhook);
// Legacy alias — kept so existing Stripe dashboard endpoints keep working.
router.post('/webhooks/stripe', handleStripeWebhook);

router.post('/webhook/paddle', (req: Request, res: Response, next: NextFunction) =>
  getPaddleWebhookHandler().handleWebhook(req, res).catch(next),
);

export default router;
