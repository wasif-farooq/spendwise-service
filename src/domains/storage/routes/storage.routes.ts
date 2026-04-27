import { Router } from 'express';
import multer from 'multer';
import { StorageController } from '../controllers/StorageController';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { ConfigLoader } from '@config/ConfigLoader';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';

const router = Router();

// Get controller from container
const config = ConfigLoader.getInstance();
const controller = Container.getInstance().resolve<StorageController>(TOKENS.StorageController);

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: parseInt(process.env.STORAGE_MAX_FILE_SIZE || '10485760'), // 10MB
    },
});

// All storage routes require authentication
router.use(requireAuth);

/**
 * POST /v1/storage/upload
 * Upload a file
 * Body: multipart/form-data
 * - file: File (required)
 * - bucket: string (optional, defaults to attachments bucket)
 * - workspaceId: string (required)
 */
router.post(
    '/upload',
    upload.single('file'),
    requirePermission('storage:create'),
    controller.upload.bind(controller)
);

/**
 * GET /v1/storage/:id
 * Get file metadata and presigned URL
 */
router.get(
    '/:id',
    requirePermission('storage:view'),
    controller.get.bind(controller)
);

/**
 * DELETE /v1/storage/:id
 * Delete a file
 */
router.delete(
    '/:id',
    requirePermission('storage:delete'),
    controller.delete.bind(controller)
);

/**
 * GET /v1/storage/:id/download
 * Redirect to presigned URL for download
 */
router.get(
    '/:id/download',
    requirePermission('storage:view'),
    controller.download.bind(controller)
);

/**
 * POST /v1/storage/refresh-url/:id
 * Refresh presigned URL
 */
router.post(
    '/refresh-url/:id',
    requirePermission('storage:view'),
    controller.refreshUrl.bind(controller)
);

/**
 * GET /v1/storage/workspace/:workspaceId
 * List files for a workspace
 */
router.get(
    '/workspace/:workspaceId',
    requirePermission('storage:view'),
    controller.listByWorkspace.bind(controller)
);

/**
 * POST /v1/storage/:workspaceId/transactions/receipt
 * Upload a transaction receipt
 * Body: multipart/form-data
 * - file: File (required)
 */
router.post(
    '/:workspaceId/transactions/receipt',
    upload.single('file'),
    requirePermission('storage:create'),
    controller.uploadTransactionReceipt.bind(controller)
);

export default router;
