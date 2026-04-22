import { Router } from 'express';
import multer from 'multer';
import { UserControllerFactory } from '@factories/UserControllerFactory';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { authMiddleware } from '@shared/middleware/auth.middleware';

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: parseInt(process.env.STORAGE_MAX_FILE_SIZE || '10485760'), // 10MB
    },
});

const container = Container.getInstance();
const factory = container.resolve<UserControllerFactory>(TOKENS.UserControllerFactory);
const controller = factory.create();

router.get('/profile', authMiddleware, controller.getProfile.bind(controller));
router.put('/profile', authMiddleware, controller.updateProfile.bind(controller));
router.post('/avatar', authMiddleware, upload.single('avatar'), controller.uploadAvatar.bind(controller));

export default router;
