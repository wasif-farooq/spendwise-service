import { Router } from 'express';
import { TOKENS } from '@di/tokens';
import { controllerMiddleware } from '@shared/middlewares/controller.middleware';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';
import { CreateAccountSchema, UpdateAccountSchema } from '../dto';
import { validateBody, validateParams } from '@shared/middleware/validateBody.middleware';
import { AccountIdParamSchema } from '../dto';
import { z } from 'zod';
import {
  accountCurrencyLookup,
  isCryptoFlagOn,
  requireCryptoFlagForCurrency,
} from '@domains/currencies/cryptoFlag.middleware';

const router = Router();

router.use(controllerMiddleware(TOKENS.AccountControllerFactory));

const WorkspaceIdParamSchema = z.object({
  workspaceId: z.string().uuid('Invalid workspace ID'),
});

router.use(requireAuth);

// 400 CURRENCY_NOT_SUPPORTED for a crypto currency while the `crypto` flag is
// off; an account already in crypto may keep its currency.
const cryptoForNewAccount = requireCryptoFlagForCurrency(isCryptoFlagOn);
const cryptoForAccountUpdate = requireCryptoFlagForCurrency(isCryptoFlagOn, {
  existingCurrency: accountCurrencyLookup((req) => req.params.id),
});

router.post(
  '/:workspaceId/accounts',
  validateParams(WorkspaceIdParamSchema),
  validateBody(CreateAccountSchema),
  requirePermission('account:create'),
  cryptoForNewAccount,
  (req, res) => req.controller.createAccount(req, res),
);
router.put(
  '/:workspaceId/accounts/:id',
  validateParams(WorkspaceIdParamSchema),
  validateParams(AccountIdParamSchema),
  validateBody(UpdateAccountSchema),
  requirePermission('account:update'),
  cryptoForAccountUpdate,
  (req, res) => req.controller.updateAccount(req, res),
);
router.delete(
  '/:workspaceId/accounts/:id',
  validateParams(WorkspaceIdParamSchema),
  validateParams(AccountIdParamSchema),
  requirePermission('account:delete'),
  (req, res) => req.controller.deleteAccount(req, res),
);

router.get(
  '/:workspaceId/accounts/balance',
  validateParams(WorkspaceIdParamSchema),
  requirePermission('accounts:view'),
  (req, res) => req.controller.getTotalBalance(req, res),
);
router.get(
  '/:workspaceId/accounts/:id',
  validateParams(WorkspaceIdParamSchema),
  validateParams(AccountIdParamSchema),
  requirePermission('accounts:view'),
  (req, res) => req.controller.getAccountById(req, res),
);
router.get(
  '/:workspaceId/accounts',
  validateParams(WorkspaceIdParamSchema),
  requirePermission('accounts:view'),
  (req, res) => req.controller.getAccounts(req, res),
);

export default router;
