import { Router } from 'express';
import { AccountController } from '../controllers/AccountController';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { CreateAccountSchema, UpdateAccountSchema } from '../dto';
import { validateBody, validateParams } from '@shared/middleware/validateBody.middleware';
import { AccountIdParamSchema } from '../dto';
import { z } from 'zod';

const router = Router();

// Get controller from container
const controller = Container.getInstance().resolve<AccountController>(TOKENS.AccountController);

// Org ID param validation
const OrgIdParamSchema = z.object({
    orgId: z.string().uuid('Invalid organization ID'),
});

// All routes require authentication
router.use(requireAuth);

// Routes with orgId prefix
router.get('/:orgId/accounts', validateParams(OrgIdParamSchema), controller.getAccounts.bind(controller));
router.get('/:orgId/accounts/balance', validateParams(OrgIdParamSchema), controller.getTotalBalance.bind(controller));
router.get('/:orgId/accounts/:id', validateParams(OrgIdParamSchema), validateParams(AccountIdParamSchema), controller.getAccountById.bind(controller));
router.post('/:orgId/accounts', validateParams(OrgIdParamSchema), validateBody(CreateAccountSchema), controller.createAccount.bind(controller));
router.put('/:orgId/accounts/:id', validateParams(OrgIdParamSchema), validateParams(AccountIdParamSchema), validateBody(UpdateAccountSchema), controller.updateAccount.bind(controller));
router.delete('/:orgId/accounts/:id', validateParams(OrgIdParamSchema), validateParams(AccountIdParamSchema), controller.deleteAccount.bind(controller));

export default router;
