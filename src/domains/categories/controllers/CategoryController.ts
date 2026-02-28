import { Request, Response } from 'express';
import { CategoryService } from '../services/CategoryService';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { TOKENS } from '@di/tokens';
import { Container } from '@di/Container';

let categoryServiceInstance: CategoryService | null = null;

function getCategoryService(): CategoryService {
    if (!categoryServiceInstance) {
        const container = Container.getInstance();
        const db = container.resolve<DatabaseFacade>(TOKENS.Database as any);
        const categoryRepo = new CategoryRepository(db);
        categoryServiceInstance = new CategoryService(categoryRepo);
    }
    return categoryServiceInstance;
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
        const { name, type, icon, color } = req.body;

        try {
            const service = getCategoryService();
            const category = await service.createCategory({
                name,
                type: (type as 'income' | 'expense' | 'all') || 'all',
                icon,
                color,
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
        const { name, type, icon, color } = req.body;

        try {
            const service = getCategoryService();
            const category = await service.updateCategory(id, {
                name,
                type,
                icon,
                color,
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
}
