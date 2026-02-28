import { CategoryRepository } from '../repositories/CategoryRepository';
import { Category, CategoryProps } from '../models/Category';
import { AppError } from '@shared/errors/AppError';

export class CategoryService {
    constructor(private categoryRepo: CategoryRepository) { }

    async getAllCategories(workspaceId: string): Promise<Category[]> {
        return this.categoryRepo.findAll(workspaceId);
    }

    async getCategoryById(id: string, workspaceId: string): Promise<Category> {
        const category = await this.categoryRepo.findById(id, workspaceId);
        if (!category) {
            throw new AppError('Category not found', 404);
        }
        return category;
    }

    async getCategoriesByType(type: 'income' | 'expense', workspaceId: string): Promise<Category[]> {
        return this.categoryRepo.findByType(type, workspaceId);
    }

    async createCategory(data: CategoryProps, workspaceId: string): Promise<Category> {
        const categoryData = {
            ...data,
            workspaceId,
        };
        return this.categoryRepo.create(categoryData);
    }

    async updateCategory(id: string, data: Partial<CategoryProps>, workspaceId: string): Promise<Category> {
        const category = await this.categoryRepo.update(id, workspaceId, data);
        if (!category) {
            throw new AppError('Category not found', 404);
        }
        return category;
    }

    async deleteCategory(id: string, workspaceId: string): Promise<void> {
        const deleted = await this.categoryRepo.delete(id, workspaceId);
        if (!deleted) {
            throw new AppError('Category not found', 404);
        }
    }
}
