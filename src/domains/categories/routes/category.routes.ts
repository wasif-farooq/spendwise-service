import { Router } from 'express';
import { CategoryController } from '../controllers/CategoryController';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';
import { validateBody, validateParams } from '@shared/middleware/validateBody.middleware';
import { z } from 'zod';

const router = Router();

const controller = new CategoryController();

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
});

const UpdateCategorySchema = z.object({
    name: z.string().min(1).optional(),
    type: z.enum(['income', 'expense', 'all']).optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
});

// All routes require authentication
router.use(requireAuth);

// List categories
router.get('/:workspaceId/categories',
    validateParams(WorkspaceIdParamSchema),
    requirePermission('category:read'),
    controller.getCategories.bind(controller)
);

// Get single category
router.get('/:workspaceId/categories/:id',
    validateParams(WorkspaceIdParamSchema),
    validateParams(CategoryIdParamSchema),
    requirePermission('category:read'),
    controller.getCategoryById.bind(controller)
);

// Create category
router.post('/:workspaceId/categories',
    validateParams(WorkspaceIdParamSchema),
    validateBody(CreateCategorySchema),
    requirePermission('category:create'),
    controller.createCategory.bind(controller)
);

// Update category
router.put('/:workspaceId/categories/:id',
    validateParams(WorkspaceIdParamSchema),
    validateParams(CategoryIdParamSchema),
    validateBody(UpdateCategorySchema),
    requirePermission('category:edit'),
    controller.updateCategory.bind(controller)
);

// Delete category
router.delete('/:workspaceId/categories/:id',
    validateParams(WorkspaceIdParamSchema),
    validateParams(CategoryIdParamSchema),
    requirePermission('category:delete'),
    controller.deleteCategory.bind(controller)
);

export default router;
