import { Router } from 'express';
import { PaymentControllerFactory } from '@factories/PaymentControllerFactory';

const router = Router();
const factory = new PaymentControllerFactory();
const controller = factory.create();

// Public routes
router.get('/gateways', controller.getGateways.bind(controller));
router.post('/checkout', controller.createCheckout.bind(controller));

export default router;