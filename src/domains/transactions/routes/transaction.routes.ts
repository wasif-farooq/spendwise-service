import { Router } from 'express';
import { TOKENS } from '@di/tokens';
import { controllerMiddleware } from '@shared/middlewares/controller.middleware';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';
import { validateBody, validateParams } from '@shared/middleware/validateBody.middleware';
import { z } from 'zod';

const router = Router();

router.use(controllerMiddleware(TOKENS.TransactionControllerFactory));

const WorkspaceIdParamSchema = z.object({
    workspaceId: z.string().uuid('Invalid workspace ID'),
});

const AccountIdParamSchema = z.object({
    accountId: z.string().uuid('Invalid account ID'),
});

const TransactionIdParamSchema = z.object({
    id: z.string().uuid('Invalid transaction ID'),
});

const CreateTransactionSchema = z.object({
    type: z.enum(['income', 'expense']),
    amount: z.number().positive('Amount must be positive'),
    currency: z.string().length(3, 'Currency must be 3 characters'),
    description: z.string().optional(),
    date: z.string(),
    categoryId: z.string().uuid().optional(),
    linkedTransactionIds: z.array(z.string().uuid()).optional(),
    exchangeRate: z.number().optional(),
});

const UpdateTransactionSchema = z.object({
    type: z.enum(['income', 'expense']).optional(),
    amount: z.number().positive().optional(),
    currency: z.string().length(3).optional(),
    description: z.string().optional(),
    date: z.string().optional(),
    categoryId: z.string().uuid().optional(),
    linkedTransactionIds: z.array(z.string().uuid()).optional(),
    exchangeRate: z.number().optional(),
});

const LinkTransactionSchema = z.object({
    linkedTransactionId: z.string().uuid('Invalid linked transaction ID'),
});

const UnlinkTransactionSchema = z.object({
    linkedId: z.string().uuid('Invalid linked transaction ID'),
});

const TransferSchema = z.object({
    fromAccountId: z.string().uuid('Invalid source account ID'),
    toAccountId: z.string().uuid('Invalid destination account ID'),
    amount: z.number().positive('Amount must be positive'),
    currency: z.string().length(3, 'Currency must be 3 characters'),
    exchangeRate: z.number().positive().optional(),
    date: z.string(),
    description: z.string().optional(),
});

router.use(requireAuth);

router.get('/:workspaceId/accounts/:accountId/transactions', 
    validateParams(WorkspaceIdParamSchema), 
    validateParams(AccountIdParamSchema),
    requirePermission('transactions:view'), 
    (req, res) => req.controller.getTransactions(req, res)
);

router.get('/:workspaceId/accounts/:accountId/transactions/:id', 
    validateParams(WorkspaceIdParamSchema), 
    validateParams(AccountIdParamSchema),
    validateParams(TransactionIdParamSchema), 
    requirePermission('transactions:view'), 
    (req, res) => req.controller.getTransactionById(req, res)
);

router.post('/:workspaceId/accounts/:accountId/transactions', 
    validateParams(WorkspaceIdParamSchema), 
    validateParams(AccountIdParamSchema),
    validateBody(CreateTransactionSchema), 
    requirePermission('transaction:create'), 
    (req, res) => req.controller.createTransaction(req, res)
);

router.put('/:workspaceId/accounts/:accountId/transactions/:id', 
    validateParams(WorkspaceIdParamSchema), 
    validateParams(AccountIdParamSchema),
    validateParams(TransactionIdParamSchema), 
    validateBody(UpdateTransactionSchema), 
    requirePermission('transaction:edit'), 
    (req, res) => req.controller.updateTransaction(req, res)
);

router.delete('/:workspaceId/accounts/:accountId/transactions/:id', 
    validateParams(WorkspaceIdParamSchema), 
    validateParams(AccountIdParamSchema),
    validateParams(TransactionIdParamSchema), 
    requirePermission('transaction:delete'), 
    (req, res) => req.controller.deleteTransaction(req, res)
);

router.post('/:workspaceId/accounts/:accountId/transactions/:id/link', 
    validateParams(WorkspaceIdParamSchema), 
    validateParams(AccountIdParamSchema),
    validateParams(TransactionIdParamSchema), 
    validateBody(LinkTransactionSchema), 
    requirePermission('transaction:edit'), 
    (req, res) => req.controller.linkTransaction(req, res)
);

router.delete('/:workspaceId/accounts/:accountId/transactions/:id/link', 
    validateParams(WorkspaceIdParamSchema), 
    validateParams(AccountIdParamSchema),
    validateParams(TransactionIdParamSchema), 
    validateBody(UnlinkTransactionSchema), 
    requirePermission('transaction:edit'), 
    (req, res) => req.controller.unlinkTransaction(req, res)
);

router.get('/:workspaceId/accounts/:accountId/transactions/stats', 
    validateParams(WorkspaceIdParamSchema), 
    validateParams(AccountIdParamSchema),
    requirePermission('transactions:view'), 
    (req, res) => req.controller.getAccountStats(req, res)
);

router.get('/:workspaceId/transactions/accounts/stats', 
    validateParams(WorkspaceIdParamSchema), 
    requirePermission('transactions:view'), 
    (req, res) => req.controller.getWorkspaceAccountStats(req, res)
);

router.get('/:workspaceId/transactions/stats', 
    validateParams(WorkspaceIdParamSchema), 
    requirePermission('transactions:view'), 
    (req, res) => req.controller.getWorkspaceStats(req, res)
);

router.post('/:workspaceId/transactions/transfer', 
    validateParams(WorkspaceIdParamSchema), 
    validateBody(TransferSchema),
    requirePermission('transaction:create'), 
    (req, res) => req.controller.transfer(req, res)
);

router.get('/:workspaceId/transactions/all',
    validateParams(WorkspaceIdParamSchema),
    requirePermission('transactions:view'),
    (req, res) => req.controller.getAllTransactions(req, res)
);

export default router;