import { Router } from 'express';
import { TransactionController } from '../controllers/TransactionController';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';
import { validateBody, validateParams } from '@shared/middleware/validateBody.middleware';
import { z } from 'zod';

const router = Router();

// Get controller from container
const controller = Container.getInstance().resolve<TransactionController>(TOKENS.TransactionController);

// Workspace ID param validation
const WorkspaceIdParamSchema = z.object({
    workspaceId: z.string().uuid('Invalid workspace ID'),
});

// Account ID param validation
const AccountIdParamSchema = z.object({
    accountId: z.string().uuid('Invalid account ID'),
});

// Transaction ID param validation
const TransactionIdParamSchema = z.object({
    id: z.string().uuid('Invalid transaction ID'),
});

// Create transaction schema (no transfer type)
const CreateTransactionSchema = z.object({
    accountId: z.string().uuid('Invalid account ID'),
    type: z.enum(['income', 'expense']),
    amount: z.number().positive('Amount must be positive'),
    currency: z.string().length(3, 'Currency must be 3 characters'),
    description: z.string().optional(),
    date: z.string(),
    categoryId: z.string().uuid().optional(),
    linkedTransactionId: z.string().uuid().optional(),
    linkedAccountId: z.string().uuid().optional(),
    exchangeRate: z.number().optional(),
});

// Update transaction schema
const UpdateTransactionSchema = z.object({
    accountId: z.string().uuid().optional(),
    type: z.enum(['income', 'expense']).optional(),
    amount: z.number().positive().optional(),
    currency: z.string().length(3).optional(),
    description: z.string().optional(),
    date: z.string().optional(),
    categoryId: z.string().uuid().optional(),
    linkedTransactionId: z.string().uuid().optional(),
    linkedAccountId: z.string().uuid().optional(),
    exchangeRate: z.number().optional(),
});

// Link transaction schema
const LinkTransactionSchema = z.object({
    linkedTransactionId: z.string().uuid('Invalid linked transaction ID'),
    linkedAccountId: z.string().uuid('Invalid linked account ID'),
});

// All routes require authentication
router.use(requireAuth);

// ====================
// Transaction Routes
// ====================

// List transactions (with filters: account, category, date range)
router.get('/', validateParams(WorkspaceIdParamSchema), requirePermission('transaction:read'), controller.getTransactions.bind(controller));

// Get single transaction
router.get('/:workspaceId/:id', validateParams(WorkspaceIdParamSchema), validateParams(TransactionIdParamSchema), requirePermission('transaction:read'), controller.getTransactionById.bind(controller));

// Create transaction
router.post('/:workspaceId', validateParams(WorkspaceIdParamSchema), validateBody(CreateTransactionSchema), requirePermission('transaction:create'), controller.createTransaction.bind(controller));

// Update transaction
router.put('/:workspaceId/:id', validateParams(WorkspaceIdParamSchema), validateParams(TransactionIdParamSchema), validateBody(UpdateTransactionSchema), requirePermission('transaction:edit'), controller.updateTransaction.bind(controller));

// Delete transaction
router.delete('/:workspaceId/:id', validateParams(WorkspaceIdParamSchema), validateParams(TransactionIdParamSchema), requirePermission('transaction:delete'), controller.deleteTransaction.bind(controller));

// Link transaction to another
router.post('/:workspaceId/:id/link', validateParams(WorkspaceIdParamSchema), validateParams(TransactionIdParamSchema), validateBody(LinkTransactionSchema), requirePermission('transaction:edit'), controller.linkTransaction.bind(controller));

// Unlink transaction
router.delete('/:workspaceId/:id/link', validateParams(WorkspaceIdParamSchema), validateParams(TransactionIdParamSchema), requirePermission('transaction:edit'), controller.unlinkTransaction.bind(controller));

// ====================
// Stats Routes
// ====================

// Get workspace-wide stats
router.get('/:workspaceId/transactions/stats', validateParams(WorkspaceIdParamSchema), requirePermission('transaction:read'), controller.getWorkspaceStats.bind(controller));

// Get all accounts stats for workspace
router.get('/:workspaceId/transactions/accounts/stats', validateParams(WorkspaceIdParamSchema), requirePermission('transaction:read'), controller.getWorkspaceAccountStats.bind(controller));

// Get single account stats
router.get('/transactions/accounts/:accountId/stats', validateParams(AccountIdParamSchema), requirePermission('transaction:read'), controller.getAccountStats.bind(controller));

export default router;
