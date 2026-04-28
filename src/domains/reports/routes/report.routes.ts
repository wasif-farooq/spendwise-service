import { Router } from 'express';
import { requirePermission } from '@shared/middleware/permission.middleware';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { KafkaClient } from '@messaging/implementations/kafka/KafkaClient';
import { ConfigLoader } from '@config/ConfigLoader';
import { ReportController } from '../controllers/ReportController';

const router = Router();

// Initialize Kafka client and controller
const config = ConfigLoader.getInstance();
const kafkaConfig = config.get('messaging.kafka');
const kafkaClient = new KafkaClient();
const controller = new ReportController(kafkaClient);

// All routes require authentication
router.use(requireAuth);

// Export report endpoint - mounted at /v1/workspaces, so path is /:workspaceId/reports/export
router.post(
  '/:workspaceId/reports/export',
  requirePermission('analytics:export'),
  controller.exportReport.bind(controller)
);

export default router;