import { Router } from 'express';
import { UserControllerFactory } from '@factories/UserControllerFactory';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { authMiddleware } from '@shared/middleware/auth.middleware';

const router = Router();
const container = Container.getInstance();
const factory = container.resolve<UserControllerFactory>(TOKENS.UserControllerFactory);
const controller = factory.create();

router.get('/profile', authMiddleware, controller.getProfile.bind(controller));
router.put('/profile', authMiddleware, controller.updateProfile.bind(controller));

export default router;
