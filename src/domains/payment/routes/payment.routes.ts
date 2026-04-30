import { Router } from 'express';
import { TOKENS } from '@di/tokens';
import { controllerMiddleware } from '@shared/middlewares/controller.middleware';
import { getStripeWebhookHandler } from '../webhooks/StripeWebhookHandler';

const router = Router();

router.use(controllerMiddleware(TOKENS.PaymentControllerFactory));

router.get('/gateways', (req, res, next) => req.controller.getGateways(req, res).catch(next));
router.post('/checkout', (req, res, next) => req.controller.createCheckout(req, res).catch(next));

router.post('/webhook/stripe', async (req, res) => {
    const handler = getStripeWebhookHandler();
    await handler.handleWebhook(req, res);
});

router.post('/webhooks/stripe', async (req, res) => {
    const handler = getStripeWebhookHandler();
    await handler.handleWebhook(req, res);
});

export default router;