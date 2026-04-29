import { Router } from 'express';
import { CategoryControllerFactory } from '@factories/CategoryControllerFactory';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';
import { validateBody, validateParams } from '@shared/middleware/validateBody.middleware';
import { z } from 'zod';

const router = Router();
const factory = new CategoryControllerFactory();
const controller = factory.create();

// Validation schemas
const WorkspaceIdParamSchema = z.object({
    workspaceId: z.string().uuid('Invalid workspace ID'),
});

const CategoryIdParamSchema = z.object({
    id: z.string().uuid('Invalid category ID'),
});

const CreateCategorySchema = z.object({
    name: z.string().min(1, 'Name is required'),
    type: z.enum(['income', 'expense', 'all']).optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    description: z.string().optional(),
});

const UpdateCategorySchema = z.object({
    name: z.string().min(1).optional(),
    type: z.enum(['income', 'expense', 'all']).optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    description: z.string().optional(),
});

const DeleteCategorySchema = z.object({
    replaceWithId: z.string().uuid().optional(),
});

// All routes require authentication
router.use(requireAuth);

// List categories
router.get('/:workspaceId/categories',
    validateParams(WorkspaceIdParamSchema),
    requirePermission('categories:view'),
    controller.getCategories.bind(controller)
);

// Get all category transaction counts - must be before /:id route
router.get('/:workspaceId/categories/transaction-counts',
    validateParams(WorkspaceIdParamSchema),
    requirePermission('categories:view'),
    controller.getAllCategoryTransactionCounts.bind(controller)
);

// Get single category
router.get('/:workspaceId/categories/:id',
    validateParams(WorkspaceIdParamSchema),
    validateParams(CategoryIdParamSchema),
    requirePermission('categories:view'),
    controller.getCategoryById.bind(controller)
);

// Create category
router.post('/:workspaceId/categories',
    validateParams(WorkspaceIdParamSchema),
    validateBody(CreateCategorySchema),
    requirePermission('categories:create'),
    controller.createCategory.bind(controller)
);

// Update category
router.put('/:workspaceId/categories/:id',
    validateParams(WorkspaceIdParamSchema),
    validateParams(CategoryIdParamSchema),
    validateBody(UpdateCategorySchema),
    requirePermission('categories:edit'),
    controller.updateCategory.bind(controller)
);

// Delete category
router.delete('/:workspaceId/categories/:id',
    validateParams(WorkspaceIdParamSchema),
    validateParams(CategoryIdParamSchema),
    requirePermission('categories:delete'),
    controller.deleteCategory.bind(controller)
);

// Get category transaction count
router.get('/:workspaceId/categories/:id/transaction-count',
    validateParams(WorkspaceIdParamSchema),
    validateParams(CategoryIdParamSchema),
    requirePermission('categories:view'),
    controller.getCategoryTransactionCount.bind(controller)
);

// Delete category with reassignment
router.post('/:workspaceId/categories/:id/delete-with-reassign',
    validateParams(WorkspaceIdParamSchema),
    validateParams(CategoryIdParamSchema),
    validateBody(DeleteCategorySchema),
    requirePermission('categories:delete'),
    controller.deleteCategoryWithReassign.bind(controller)
);

export default router;
