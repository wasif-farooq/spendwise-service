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

// Transaction ID param validation
const TransactionIdParamSchema = z.object({
    id: z.string().uuid('Invalid transaction ID'),
});

// Create transaction schema
const CreateTransactionSchema = z.object({
    accountId: z.string().uuid('Invalid account ID'),
    type: z.enum(['income', 'expense', 'transfer']),
    amount: z.number().positive('Amount must be positive'),
    currency: z.string().length(3, 'Currency must be 3 characters'),
    description: z.string().optional(),
    date: z.string(),
    categoryId: z.string().uuid().optional(),
    toAccountId: z.string().uuid().optional(),
    exchangeRate: z.number().optional(),
});

// Update transaction schema
const UpdateTransactionSchema = z.object({
    accountId: z.string().uuid().optional(),
    type: z.enum(['income', 'expense', 'transfer']).optional(),
    amount: z.number().positive().optional(),
    currency: z.string().length(3).optional(),
    description: z.string().optional(),
    date: z.string().optional(),
    categoryId: z.string().uuid().optional(),
    toAccountId: z.string().uuid().optional(),
    exchangeRate: z.number().optional(),
});

// All routes require authentication
router.use(requireAuth);

// Routes
router.get('/:workspaceId', validateParams(WorkspaceIdParamSchema), requirePermission('transaction:read'), controller.getTransactions.bind(controller));
router.get('/:workspaceId/:id', validateParams(WorkspaceIdParamSchema), validateParams(TransactionIdParamSchema), requirePermission('transaction:read'), controller.getTransactionById.bind(controller));
router.post('/:workspaceId', validateParams(WorkspaceIdParamSchema), validateBody(CreateTransactionSchema), requirePermission('transaction:create'), controller.createTransaction.bind(controller));
router.put('/:workspaceId/:id', validateParams(WorkspaceIdParamSchema), validateParams(TransactionIdParamSchema), validateBody(UpdateTransactionSchema), requirePermission('transaction:edit'), controller.updateTransaction.bind(controller));
router.delete('/:workspaceId/:id', validateParams(WorkspaceIdParamSchema), validateParams(TransactionIdParamSchema), requirePermission('transaction:delete'), controller.deleteTransaction.bind(controller));

export default router;
