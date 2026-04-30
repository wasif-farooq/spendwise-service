import { Router } from 'express';
import multer from 'multer';
import { TOKENS } from '@di/tokens';
import { controllerMiddleware } from '@shared/middlewares/controller.middleware';
import { authMiddleware } from '@shared/middleware/auth.middleware';

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: parseInt(process.env.STORAGE_MAX_FILE_SIZE || '10485760'), // 10MB
    },
});

router.use(controllerMiddleware(TOKENS.UserControllerFactory));

router.get('/profile', authMiddleware, (req, res) => req.controller.getProfile(req, res));
router.put('/profile', authMiddleware, (req, res) => req.controller.updateProfile(req, res));
router.post('/avatar', authMiddleware, upload.single('avatar'), (req, res) => req.controller.uploadAvatar(req, res));

export default router;