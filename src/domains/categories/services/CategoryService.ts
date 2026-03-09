import { CategoryRepository } from '../repositories/CategoryRepository';
import { Category, CategoryProps } from '../models/Category';
import { AppError } from '@shared/errors/AppError';
import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';

export class CategoryService {
    constructor(
        private categoryRepo: CategoryRepository,
        private transactionRepo?: TransactionRepository
    ) { }

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

    async getTransactionCount(categoryId: string): Promise<number> {
        if (!this.transactionRepo) {
            return 0;
        }
        return this.transactionRepo.countByCategoryId(categoryId);
    }

    async getAllTransactionCounts(workspaceId: string): Promise<Record<string, number>> {
        if (!this.transactionRepo) {
            return {};
        }
        const categories = await this.categoryRepo.findAll(workspaceId);
        const counts: Record<string, number> = {};
        
        for (const category of categories) {
            if (category.id) {
                counts[category.id] = await this.transactionRepo.countByCategoryId(category.id);
            }
        }
        return counts;
    }

    async reassignTransactions(fromCategoryId: string, toCategoryId: string, workspaceId: string): Promise<void> {
        if (!this.transactionRepo) {
            throw new AppError('Transaction repository not available', 500);
        }
        await this.transactionRepo.reassignCategory(fromCategoryId, toCategoryId, workspaceId);
    }

    async deleteCategory(id: string, workspaceId: string): Promise<void> {
        const deleted = await this.categoryRepo.delete(id, workspaceId);
        if (!deleted) {
            throw new AppError('Category not found', 404);
        }
    }
}
