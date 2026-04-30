import { CategoryRequestRepository } from './CategoryRequestRepository';

export class CategoryRequestRepositoryFactory {
    private static instance: CategoryRequestRepository | null = null;

    create(): CategoryRequestRepository {
        if (CategoryRequestRepositoryFactory.instance) {
            return CategoryRequestRepositoryFactory.instance;
        }

        CategoryRequestRepositoryFactory.instance = new CategoryRequestRepository();
        return CategoryRequestRepositoryFactory.instance;
    }
}