import { Router } from 'express';
import { PaymentController } from '../controllers/PaymentController';

const router = Router();
const controller = new PaymentController();

// Public routes
router.get('/gateways', controller.getGateways.bind(controller));
router.post('/checkout', controller.createCheckout.bind(controller));

export default router;