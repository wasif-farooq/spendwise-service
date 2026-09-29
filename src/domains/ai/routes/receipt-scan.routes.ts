import { RequestHandler, Router } from 'express';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';
import { ReceiptScanController } from '../receipts/ReceiptScanController';
import { ReceiptScanService } from '../receipts/ReceiptScanService';
import { ReceiptScanRepository } from '../receipts/ReceiptScanRepository';
import { createReceiptExtractor, ReceiptAiConfig } from '../receipts/createReceiptExtractor';
import {
  createReceiptScanLimiter,
  receiptScanQuota,
  receiptScanUpload,
} from '../receipts/receiptScan.middleware';

/**
 * Receipt scanning (at /v1/:workspaceId/ai):
 *   POST /receipt-scan        multipart `file` (JPEG/PNG/WebP ≤ 10 MB)
 *                             → 200 { data: ReceiptScanResult }
 *                             → 400/402/413/415/422/429/503 { message, code }
 *   GET  /receipt-scan/usage  → 200 { data: { used, limit | null, resetsAt } }
 *
 * Stateless: the image goes to the provider and is dropped. The receipt is
 * attached to the transaction separately, through the storage upload.
 */
export const createReceiptScanRouter = (
  getService: () => Promise<ReceiptScanService>,
  options: { limiter?: RequestHandler } = {},
) => {
  const router = Router();
  const controller = new ReceiptScanController(getService);
  // The permission the role editor stores (PERMISSIONS.TRANSACTIONS.CREATE).
  const canCreate = requirePermission('transactions:create');

  router.get('/:workspaceId/ai/receipt-scan/usage', requireAuth, canCreate, (req, res) =>
    controller.usage(req, res),
  );
  router.post(
    '/:workspaceId/ai/receipt-scan',
    requireAuth,
    canCreate,
    receiptScanQuota(getService),
    options.limiter ?? createReceiptScanLimiter(),
    receiptScanUpload,
    (req, res) => controller.scan(req, res),
  );
  return router;
};

let servicePromise: Promise<ReceiptScanService> | null = null;

/** Built on first use, so importing the router opens no connections. */
const buildService = async (): Promise<ReceiptScanService> => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { CategoryRepository } = require('@domains/categories/repositories/CategoryRepository');
  const { AccountRepository } = require('@domains/accounts/repositories/AccountRepository');
  /* eslint-enable @typescript-eslint/no-var-requires */
  const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
  const ai: ReceiptAiConfig = ConfigLoader.getInstance().get('ai') ?? {};
  const free = Number(ai.freeScansPerMonth);

  return new ReceiptScanService({
    extractor: createReceiptExtractor(ai),
    repository: new ReceiptScanRepository(db),
    categories: new CategoryRepository(db),
    accounts: new AccountRepository(db),
    freeScansPerMonth: Number.isFinite(free) && free >= 0 ? free : 5,
  });
};

export default createReceiptScanRouter(() => {
  if (!servicePromise) {
    servicePromise = buildService().catch((error) => {
      servicePromise = null;
      throw error;
    });
  }
  return servicePromise;
});
