import { Router } from 'express';
import multer from 'multer';
import { TOKENS } from '@di/tokens';
import { controllerMiddleware } from '@shared/middlewares/controller.middleware';
import { ConfigLoader } from '@config/ConfigLoader';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';

const router = Router();

const config = ConfigLoader.getInstance();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: parseInt(process.env.STORAGE_MAX_FILE_SIZE || '10485760'), // 10MB
    },
});

router.use(controllerMiddleware(TOKENS.StorageControllerFactory));
router.use(requireAuth);

router.post(
    '/upload',
    upload.single('file'),
    requirePermission('storage:create'),
    (req, res) => req.controller.upload(req, res)
);

router.get(
    '/:id',
    requirePermission('storage:view'),
    (req, res) => req.controller.get(req, res)
);

router.delete(
    '/:id',
    requirePermission('storage:delete'),
    (req, res) => req.controller.delete(req, res)
);

router.get(
    '/:id/download',
    requirePermission('storage:view'),
    (req, res) => req.controller.download(req, res)
);

router.post(
    '/refresh-url/:id',
    requirePermission('storage:view'),
    (req, res) => req.controller.refreshUrl(req, res)
);

router.get(
    '/workspace/:workspaceId',
    requirePermission('storage:view'),
    (req, res) => req.controller.listByWorkspace(req, res)
);

router.post(
    '/:workspaceId/transactions/receipt',
    upload.single('file'),
    requirePermission('storage:create'),
    (req, res) => req.controller.uploadTransactionReceipt(req, res)
);

export default router;