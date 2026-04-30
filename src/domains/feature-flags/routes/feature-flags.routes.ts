import { Router } from 'express';
import { TOKENS } from '@di/tokens';
import { controllerMiddleware } from '@shared/middlewares/controller.middleware';

const router = Router();

router.use(controllerMiddleware(TOKENS.FeatureFlagControllerFactory));

router.get('/', (req, res) => req.controller.getAll(req, res));

export default router;