import { Router } from 'express';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { validateQuery, validateParams } from '@shared/middleware/validateBody.middleware';
import { z } from 'zod';
import {
  ActivityQuerySchema,
  EntityHistoryParamsSchema,
  EntityHistoryQuerySchema,
} from '../validators/activity.validation';
import { ActivityLogController } from '../controllers/ActivityLogController';
import { ActivityLogService } from '../services/ActivityLogService';
import { ActivityLogRepository } from '../repositories/ActivityLogRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { PostgresFactory } from '@database/factories/PostgresFactory';

const router = Router();

const dbFactory = new PostgresFactory();
const db = new DatabaseFacade(dbFactory);
const repository = new ActivityLogRepository(db);
const service = new ActivityLogService(repository);
const controller = new ActivityLogController(service);

router.use(requireAuth);

const WorkspaceIdParamSchema = z.object({
  workspaceId: z.string().uuid('Invalid workspace ID'),
});

router.get(
  '/:workspaceId/activity',
  validateParams(WorkspaceIdParamSchema),
  validateQuery(ActivityQuerySchema),
  controller.getActivities.bind(controller),
);

router.get(
  '/:workspaceId/activity/:entityType/:entityId',
  validateParams(WorkspaceIdParamSchema.merge(EntityHistoryParamsSchema)),
  validateQuery(EntityHistoryQuerySchema),
  controller.getEntityHistory.bind(controller),
);

router.get('/activity/partitions', controller.listPartitions.bind(controller));

router.post('/activity/partitions/ensure', controller.ensurePartitions.bind(controller));

export default router;
