import { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import type { CacheFacade } from '@facades/CacheFacade';
import { ActivityCaptureService } from '@shared/ActivityCaptureService';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';
import { createRateLimiter, RateLimitStore } from '@shared/middleware/rateLimit.middleware';
import { isFeatureFlagOn, requireFeatureFlag } from '@shared/middleware/requireFeatureFlag';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '@shared/middleware/validateBody.middleware';
import { isCryptoFlagOn } from '@domains/currencies/cryptoFlag.middleware';
import { PERMISSIONS } from '@domains/workspaces/constants/permissions';
import { ConnectionsController } from '../controllers/ConnectionsController';
import type { ConnectionService } from '../services/ConnectionService';
import {
  buildConnectionServices,
  CONNECTED_ACCOUNTS_FLAG,
} from '../services/buildConnectionServices';

/**
 * Connected accounts (at /v1/:workspaceId/connections). Every route: the
 * `connectedAccounts` flag (404 FEATURE_DISABLED while off) → auth →
 * permission → zod validation.
 *   GET    /providers                       integrations:view
 *   GET    /                                integrations:view  { connections, usage }
 *   POST   /                                integrations:manage  402/409/400/503
 *   GET    /:id/assets                      integrations:manage  { assets, accounts, accountsUsage }
 *   POST   /:id/links                       integrations:manage  200, or 202 while the first sync runs
 *   DELETE /:id/links/:linkId?deleteImported=  integrations:manage
 *   POST   /:id/sync                        integrations:manage  once a minute per connection (429 TOO_MANY_SYNCS)
 *   DELETE /:id?deleteImported=             integrations:manage  204
 */

const WorkspaceParams = z.object({ workspaceId: z.string().uuid('Invalid workspace ID') });
const ConnectionParams = WorkspaceParams.extend({ id: z.string().uuid('Invalid connection ID') });
const LinkParams = ConnectionParams.extend({ linkId: z.string().uuid('Invalid link ID') });
const DeleteQuery = z.object({ deleteImported: z.enum(['true', 'false', '1', '0']).optional() });

export const CreateConnectionSchema = z.object({
  provider: z.enum([
    'crypto:evm',
    'crypto:bitcoin',
    'crypto:tron',
    'crypto:solana',
    'stripe',
    'paypal',
  ]),
  address: z.string().trim().max(128).optional(),
  displayName: z.string().trim().max(100).optional(),
  chains: z.array(z.string().max(20)).max(20).optional(),
});

export const LinkSchema = z.object({
  links: z
    .array(
      z
        .object({
          assetKey: z.string().min(1).max(160),
          accountId: z.string().uuid().optional(),
          newAccount: z
            .object({
              name: z.string().trim().min(1).max(100),
              color: z.string().max(20).optional(),
            })
            .optional(),
          syncMode: z.enum(['history', 'from_today']),
        })
        .refine((l) => Boolean(l.accountId) !== Boolean(l.newAccount), {
          message: 'Give either accountId or newAccount',
        }),
    )
    .min(1)
    .max(50),
});

export const createSyncLimiter = (store?: RateLimitStore) =>
  createRateLimiter(
    {
      bucket: 'connection-sync',
      max: 1,
      windowSeconds: 60,
      message: 'This wallet was synced less than a minute ago. Try again shortly.',
      code: 'TOO_MANY_SYNCS',
      keyGenerator: (req) => req.params.id || 'unknown',
    },
    store,
  );

export const createConnectionsRouter = (
  getService: () => Promise<ConnectionService>,
  options: { isEnabled?: () => Promise<boolean>; syncLimiter?: RequestHandler } = {},
) => {
  const router = Router();
  const controller = new ConnectionsController(getService);
  const flagOn = requireFeatureFlag(CONNECTED_ACCOUNTS_FLAG, {
    isEnabled: options.isEnabled ?? isFeatureFlagOn(CONNECTED_ACCOUNTS_FLAG),
    message: 'Connected accounts are not available.',
  });
  const canView = requirePermission(PERMISSIONS.INTEGRATIONS.VIEW);
  const canManage = requirePermission(PERMISSIONS.INTEGRATIONS.MANAGE);
  const base = '/:workspaceId/connections';

  router.get(
    `${base}/providers`,
    flagOn,
    requireAuth,
    validateParams(WorkspaceParams),
    canView,
    controller.providers,
  );
  router.get(base, flagOn, requireAuth, validateParams(WorkspaceParams), canView, controller.list);
  router.post(
    base,
    flagOn,
    requireAuth,
    validateParams(WorkspaceParams),
    canManage,
    validateBody(CreateConnectionSchema),
    controller.create,
  );
  router.get(
    `${base}/:id/assets`,
    flagOn,
    requireAuth,
    validateParams(ConnectionParams),
    canManage,
    controller.assets,
  );
  router.post(
    `${base}/:id/links`,
    flagOn,
    requireAuth,
    validateParams(ConnectionParams),
    canManage,
    validateBody(LinkSchema),
    (req, res) => controller.link(req, res),
  );
  router.delete(
    `${base}/:id/links/:linkId`,
    flagOn,
    requireAuth,
    validateParams(LinkParams),
    validateQuery(DeleteQuery),
    canManage,
    controller.unlink,
  );
  router.post(
    `${base}/:id/sync`,
    flagOn,
    requireAuth,
    validateParams(ConnectionParams),
    canManage,
    options.syncLimiter ?? createSyncLimiter(),
    controller.sync,
  );
  router.delete(
    `${base}/:id`,
    flagOn,
    requireAuth,
    validateParams(ConnectionParams),
    validateQuery(DeleteQuery),
    canManage,
    controller.remove,
  );
  return router;
};

let servicePromise: Promise<ConnectionService> | null = null;

/** Built on first use, so importing the router opens no connections. */
const buildService = async (): Promise<ConnectionService> => {
  const container = Container.getInstance();
  const db = container.resolve<DatabaseFacade>(TOKENS.Database);
  let cache: CacheFacade | undefined;
  try {
    cache = container.resolve<CacheFacade>(TOKENS.Cache);
  } catch {
    cache = undefined;
  }
  /* eslint-disable @typescript-eslint/no-var-requires */
  const {
    SubscriptionRequestRepository,
  } = require('@domains/subscription/repositories/SubscriptionRequestRepository');
  /* eslint-enable @typescript-eslint/no-var-requires */
  const subscriptions = new SubscriptionRequestRepository();
  return buildConnectionServices(db, {
    config: ConfigLoader.getInstance().get('connections') ?? {},
    cache,
    activity: ActivityCaptureService.getInstance(),
    isCryptoEnabled: isCryptoFlagOn,
    checkAccountLimit: (ownerId, currentCount) =>
      subscriptions.checkFeatureLimit(ownerId, 'accounts', currentCount),
  }).service;
};

export default createConnectionsRouter(() => {
  if (!servicePromise) {
    servicePromise = buildService().catch((error) => {
      servicePromise = null;
      throw error;
    });
  }
  return servicePromise;
});
