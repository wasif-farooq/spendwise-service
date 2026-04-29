import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { ServiceFactory } from '@factories/ServiceFactory';
import { CategoryService } from '../services/CategoryService';
import { CategoryProps } from '../models/Category';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

export class CategoryRequestRepository {
    private config = ConfigLoader.getInstance();

    private getMode(): string {
        return this.config.get('repository.mode') || 'direct';
    }

    private getService(): CategoryService {
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const repoFactory = new RepositoryFactory(db);
        const serviceFactory = new ServiceFactory(repoFactory, db);
        return serviceFactory.createCategoryService();
    }

    private wrap(promise: Promise<any>): Promise<any> {
        return promise
            .then(data => ({ data, error: null, statusCode: 200 }))
            .catch(error => ({
                error: error.message || 'An error occurred',
                statusCode: error.statusCode || 500,
                data: null
            }));
    }

    async getCategories(_workspaceId: string, _userId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(Promise.resolve([]));
        }
        throw new Error('RPC mode not implemented');
    }

    async getCategoryById(workspaceId: string, categoryId: string, _userId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.getCategoryById(categoryId, workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async create(workspaceId: string, _userId: string, data: CategoryProps) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.createCategory(data, workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async update(workspaceId: string, categoryId: string, _userId: string, data: Partial<CategoryProps>) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.updateCategory(categoryId, data, workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async delete(workspaceId: string, categoryId: string, _userId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.deleteCategory(categoryId, workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async getAllCategories(workspaceId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.getAllCategories(workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async getCategoriesByType(type: 'income' | 'expense', workspaceId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.getCategoriesByType(type, workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async getTransactionCount(categoryId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.getTransactionCount(categoryId));
        }
        throw new Error('RPC mode not implemented');
    }

    async getAllTransactionCounts(workspaceId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.getAllTransactionCounts(workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async reassignTransactions(fromCategoryId: string, toCategoryId: string, workspaceId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.reassignTransactions(fromCategoryId, toCategoryId, workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async countByWorkspace(workspaceId: string): Promise<number> {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            const categories = await service.getAllCategories(workspaceId);
            return categories.length;
        }
        throw new Error('RPC mode not implemented');
    }
}