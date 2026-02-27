import { Router } from 'express';
import { ExchangeRateController } from '../controllers/ExchangeRateController';
import { requireAuth } from '@shared/middleware/auth.middleware';

const router = Router();
const controller = new ExchangeRateController();

// All routes require authentication
router.use(requireAuth);

// GET /exchange-rates - Get all stored rates
router.get('/', controller.getRates.bind(controller));

// GET /exchange-rates/latest - Get latest rates (alias)
router.get('/latest', controller.getRates.bind(controller));

// GET /exchange-rates/supported - Get supported currencies
router.get('/supported', controller.getSupportedCurrencies.bind(controller));

// POST /exchange-rates/fetch - Manually fetch latest rates
router.post('/fetch', controller.fetchRates.bind(controller));

// GET /exchange-rates/convert?amount=100&from=USD&to=EUR
router.get('/convert', controller.convert.bind(controller));

export default router;
