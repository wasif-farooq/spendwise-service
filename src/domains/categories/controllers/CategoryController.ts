import { Request, Response } from 'express';
import { CategoryService } from '../services/CategoryService';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { TOKENS } from '@di/tokens';
import { Container } from '@di/Container';
import { SubscriptionService } from '@domains/subscription/services/SubscriptionService';

let categoryServiceInstance: CategoryService | null = null;
let subscriptionServiceInstance: SubscriptionService | null = null;
let categoryDbInstance: DatabaseFacade | null = null;

function getCategoryService(): CategoryService {
    if (!categoryServiceInstance) {
        const container = Container.getInstance();
        const db = container.resolve<DatabaseFacade>(TOKENS.Database as any);
        categoryDbInstance = db;
        const categoryRepo = new CategoryRepository(db);
        const transactionRepo = new TransactionRepository(db);
        categoryServiceInstance = new CategoryService(categoryRepo, transactionRepo);
    }
    return categoryServiceInstance;
}

function getSubscriptionService(): SubscriptionService {
    if (!subscriptionServiceInstance) {
        subscriptionServiceInstance = Container.getInstance().resolve<SubscriptionService>('SubscriptionService');
    }
    return subscriptionServiceInstance;
}

function getDb(): DatabaseFacade {
    if (!categoryDbInstance) {
        categoryDbInstance = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database as any);
    }
    return categoryDbInstance;
}

export class CategoryController {
    async getCategories(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;
        const { type } = req.query;

        try {
            const service = getCategoryService();
            let categories;
            if (type && (type === 'income' || type === 'expense')) {
                categories = await service.getCategoriesByType(type as 'income' | 'expense', workspaceId);
            } else {
                categories = await service.getAllCategories(workspaceId);
            }

            res.json(categories.map(c => c.getProps()));
        } catch (error: any) {
            res.status(400).json({ message: error.message });
        }
    }

    async getCategoryById(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;
        const { id } = req.params;

        try {
            const service = getCategoryService();
            const category = await service.getCategoryById(id, workspaceId);
            res.json(category.getProps());
        } catch (error: any) {
            res.status(error.statusCode || 400).json({ message: error.message });
        }
    }

    async createCategory(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;
        const { name, type, icon, color, description } = req.body;
        const userId = (req as any).user?.userId || (req as any).user?.id;

        try {
            // Check subscription limits before creating category
            if (userId) {
                const db = getDb();
                const countResult = await db.query(
                    `SELECT COUNT(*) as count FROM categories WHERE workspace_id = $1`,
                    [workspaceId]
                );
                const currentCount = parseInt(countResult.rows[0]?.count || '0', 10);
                const subService = getSubscriptionService();
                await subService.checkFeatureLimit(userId, 'categories_per_workspace', currentCount);
            }

            const service = getCategoryService();
            const category = await service.createCategory({
                name,
                type: (type as 'income' | 'expense' | 'all') || 'all',
                icon,
                color,
                description,
                workspaceId,
            }, workspaceId);

            res.status(201).json(category.getProps());
        } catch (error: any) {
            res.status(error.statusCode || 400).json({ message: error.message });
        }
    }

    async updateCategory(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;
        const { id } = req.params;
        const { name, type, icon, color, description } = req.body;

        try {
            const service = getCategoryService();
            const category = await service.updateCategory(id, {
                name,
                type,
                icon,
                color,
                description,
            }, workspaceId);

            res.json(category.getProps());
        } catch (error: any) {
            res.status(error.statusCode || 400).json({ message: error.message });
        }
    }

    async deleteCategory(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;
        const { id } = req.params;

        try {
            const service = getCategoryService();
            await service.deleteCategory(id, workspaceId);
            res.json({ message: 'Category deleted successfully' });
        } catch (error: any) {
            res.status(error.statusCode || 400).json({ message: error.message });
        }
    }

    async getCategoryTransactionCount(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;
        const { id } = req.params;

        try {
            const service = getCategoryService();
            const count = await service.getTransactionCount(id);
            res.json({ count });
        } catch (error: any) {
            res.status(error.statusCode || 400).json({ message: error.message });
        }
    }

    async getAllCategoryTransactionCounts(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;

        try {
            const service = getCategoryService();
            const counts = await service.getAllTransactionCounts(workspaceId);
            res.json(counts);
        } catch (error: any) {
            res.status(error.statusCode || 400).json({ message: error.message });
        }
    }

    async deleteCategoryWithReassign(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;
        const { id } = req.params;
        const { replaceWithId } = req.body;

        try {
            const service = getCategoryService();
            
            // If replacement category provided, reassign transactions first
            if (replaceWithId) {
                await service.reassignTransactions(id, replaceWithId, workspaceId);
            }
            
            // Then delete the category
            await service.deleteCategory(id, workspaceId);
            res.json({ message: 'Category deleted successfully' });
        } catch (error: any) {
            res.status(error.statusCode || 400).json({ message: error.message });
        }
    }
}
