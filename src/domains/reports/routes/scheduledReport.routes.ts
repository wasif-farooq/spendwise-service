import { Router } from 'express';
import { requirePermission } from '@shared/middleware/permission.middleware';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { ScheduledReportController } from '../controllers/ScheduledReportController';
import { ScheduledReportService } from '../services/ScheduledReportService';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { CategoryRepository } from '@domains/categories/repositories/CategoryRepository';
import { ExchangeRateRepository } from '@domains/exchange-rates/repositories/ExchangeRateRepository';
import { ExchangeRateService } from '@domains/exchange-rates/services/ExchangeRateService';

const router = Router();

// Resolve dependencies
const transactionRepo = Container.getInstance().resolve<TransactionRepository>(TOKENS.TransactionRepository);
const categoryRepo = Container.getInstance().resolve<CategoryRepository>(TOKENS.CategoryRepository);
const exchangeRateRepo = Container.getInstance().resolve<ExchangeRateRepository>(
  TOKENS.ExchangeRateRepository,
);
const service = new ScheduledReportService(
  transactionRepo,
  categoryRepo,
  new ExchangeRateService(exchangeRateRepo),
);
const controller = new ScheduledReportController(service);

// All routes require authentication
router.use(requireAuth);

// Create scheduled report
router.post(
  '/:workspaceId/reports/scheduled',
  requirePermission('analytics:export'),
  controller.create.bind(controller),
);

// List scheduled reports
router.get(
  '/:workspaceId/reports/scheduled',
  requirePermission('analytics:view'),
  controller.list.bind(controller),
);

// Get scheduled report by ID
router.get(
  '/:workspaceId/reports/scheduled/:id',
  requirePermission('analytics:view'),
  controller.getById.bind(controller),
);

// Update scheduled report
router.put(
  '/:workspaceId/reports/scheduled/:id',
  requirePermission('analytics:export'),
  controller.update.bind(controller),
);

// Delete scheduled report
router.delete(
  '/:workspaceId/reports/scheduled/:id',
  requirePermission('analytics:export'),
  controller.delete.bind(controller),
);

// Toggle active status
router.patch(
  '/:workspaceId/reports/scheduled/:id/toggle',
  requirePermission('analytics:export'),
  controller.toggleActive.bind(controller),
);

export default router;
