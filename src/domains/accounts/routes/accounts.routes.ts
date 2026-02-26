import { Router } from 'express';
import { AccountController } from '../controllers/AccountController';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';
import { CreateAccountSchema, UpdateAccountSchema } from '../dto';
import { validateBody, validateParams } from '@shared/middleware/validateBody.middleware';
import { AccountIdParamSchema } from '../dto';
import { z } from 'zod';

const router = Router();

// Get controller from container
const controller = Container.getInstance().resolve<AccountController>(TOKENS.AccountController);

// Workspace ID param validation
const WorkspaceIdParamSchema = z.object({
    workspaceId: z.string().uuid('Invalid workspace ID'),
});

// All routes require authentication + permission
router.use(requireAuth);

// Write operations first (more specific)
router.post('/:workspaceId/accounts', validateParams(WorkspaceIdParamSchema), validateBody(CreateAccountSchema), requirePermission('account:create'), controller.createAccount.bind(controller));
router.put('/:workspaceId/accounts/:id', validateParams(WorkspaceIdParamSchema), validateParams(AccountIdParamSchema), validateBody(UpdateAccountSchema), requirePermission('account:update'), controller.updateAccount.bind(controller));
router.delete('/:workspaceId/accounts/:id', validateParams(WorkspaceIdParamSchema), validateParams(AccountIdParamSchema), requirePermission('account:delete'), controller.deleteAccount.bind(controller));

// Read operations (less specific)
router.get('/:workspaceId/accounts/balance', validateParams(WorkspaceIdParamSchema), requirePermission('account:read'), controller.getTotalBalance.bind(controller));
router.get('/:workspaceId/accounts/:id', validateParams(WorkspaceIdParamSchema), validateParams(AccountIdParamSchema), requirePermission('account:read'), controller.getAccountById.bind(controller));
router.get('/:workspaceId/accounts', validateParams(WorkspaceIdParamSchema), requirePermission('account:read'), controller.getAccounts.bind(controller));

export default router;
