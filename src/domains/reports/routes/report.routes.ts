import { Router } from 'express';
import { requirePermission } from '@shared/middleware/permission.middleware';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { ReportControllerFactory } from '@factories/ReportControllerFactory';

const router = Router();

const factory = new ReportControllerFactory();
const controller = factory.create();

// All routes require authentication
router.use(requireAuth);

// Export report endpoint - mounted at /v1/workspaces, so path is /:workspaceId/reports/export
router.post(
  '/:workspaceId/reports/export',
  requirePermission('analytics:export'),
  controller.exportReport.bind(controller)
);

export default router;