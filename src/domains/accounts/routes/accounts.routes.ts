import { Router } from 'express';
import { TOKENS } from '@di/tokens';
import { controllerMiddleware } from '@shared/middlewares/controller.middleware';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';
import { CreateAccountSchema, UpdateAccountSchema } from '../dto';
import { validateBody, validateParams } from '@shared/middleware/validateBody.middleware';
import { AccountIdParamSchema } from '../dto';
import { z } from 'zod';

const router = Router();

router.use(controllerMiddleware(TOKENS.AccountControllerFactory));

const WorkspaceIdParamSchema = z.object({
    workspaceId: z.string().uuid('Invalid workspace ID'),
});

router.use(requireAuth);

router.post('/:workspaceId/accounts', validateParams(WorkspaceIdParamSchema), validateBody(CreateAccountSchema), requirePermission('account:create'), (req, res) => req.controller.createAccount(req, res));
router.put('/:workspaceId/accounts/:id', validateParams(WorkspaceIdParamSchema), validateParams(AccountIdParamSchema), validateBody(UpdateAccountSchema), requirePermission('account:update'), (req, res) => req.controller.updateAccount(req, res));
router.delete('/:workspaceId/accounts/:id', validateParams(WorkspaceIdParamSchema), validateParams(AccountIdParamSchema), requirePermission('account:delete'), (req, res) => req.controller.deleteAccount(req, res));

router.get('/:workspaceId/accounts/balance', validateParams(WorkspaceIdParamSchema), requirePermission('accounts:view'), (req, res) => req.controller.getTotalBalance(req, res));
router.get('/:workspaceId/accounts/:id', validateParams(WorkspaceIdParamSchema), validateParams(AccountIdParamSchema), requirePermission('accounts:view'), (req, res) => req.controller.getAccountById(req, res));
router.get('/:workspaceId/accounts', validateParams(WorkspaceIdParamSchema), requirePermission('accounts:view'), (req, res) => req.controller.getAccounts(req, res));

export default router;