import { Router } from 'express';
import { TOKENS } from '@di/tokens';
import { Container } from '@di/Container';
import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { validate } from '@shared/middleware/validate.middleware';
import { authRateLimits } from '@shared/middleware/rateLimit.middleware';
import { AccountDeletionController } from '../controllers/AccountDeletionController';
import { AccountDeletionService } from '../services/AccountDeletionService';
import { deleteAccountSchema } from '../validators/auth.validation';

/**
 * Account deletion (at /v1/auth/account):
 *   GET    /deletion-preview   → 200 { data: DeletionPreview }
 *   DELETE /                   { password? | confirm: "DELETE", twoFactorCode? }
 *                              → 200 { data: { deleted, deletedWorkspaces, leftWorkspaces, subscriptionCancelled } }
 *                              → 400/409/429/502 { message, code, workspaces? }
 */
export const createAccountDeletionRouter = (controller: AccountDeletionController) => {
  const router = Router();
  router.get('/deletion-preview', requireAuth, controller.preview.bind(controller));
  router.delete(
    '/',
    requireAuth,
    authRateLimits.accountDeletion,
    validate(deleteAccountSchema),
    controller.deleteAccount.bind(controller),
  );
  return router;
};

let servicePromise: Promise<AccountDeletionService> | null = null;

/** Built on first use, so importing the router opens no connections. */
const buildService = async (): Promise<AccountDeletionService> => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { RepositoryFactory } = require('@factories/RepositoryFactory');
  const { ServiceFactory } = require('@factories/ServiceFactory');
  const { AccountDeletionRepository } = require('../repositories/AccountDeletionRepository');
  const { PaymentService } = require('@domains/payment/services/PaymentService');
  const { StorageService } = require('@domains/storage/services/StorageService');
  const { StorageRepository } = require('@domains/storage/repositories/StorageRepository');
  const { EmailServiceFactory } = require('@domains/email/EmailService');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
  const repositories = new RepositoryFactory(db);

  return new AccountDeletionService({
    db,
    repository: new AccountDeletionRepository(db),
    userRepo: repositories.createUserRepository(),
    authRepo: repositories.createAuthRepository(),
    getPaddle: () => PaymentService.getInstance().getGateway('paddle'),
    getStorage: () => new StorageService(new StorageRepository(db), ConfigLoader.getInstance()),
    mailer: EmailServiceFactory.create(),
    cache: await ServiceFactory.getSharedRedisClient(),
  });
};

const controller = new AccountDeletionController(() => {
  if (!servicePromise) {
    servicePromise = buildService().catch((error) => {
      servicePromise = null;
      throw error;
    });
  }
  return servicePromise;
});

export default createAccountDeletionRouter(controller);
