import { Container } from '@di/Container';
import { CategoryController } from '@domains/categories/controllers/CategoryController';
import { CategoryRequestRepositoryFactory } from '@domains/categories/repositories/CategoryRequestRepositoryFactory';
import { SubscriptionRequestRepositoryFactory } from '@domains/subscription/repositories/SubscriptionRequestRepositoryFactory';

export class CategoryControllerFactory {
    private static instance: CategoryController | null = null;

    create(): CategoryController {
        if (CategoryControllerFactory.instance) {
            return CategoryControllerFactory.instance;
        }

        const categoryRequestRepoFactory = Container.getInstance()
            .resolve<CategoryRequestRepositoryFactory>('CategoryRequestRepositoryFactory');
        const subscriptionRequestRepoFactory = Container.getInstance()
            .resolve<SubscriptionRequestRepositoryFactory>('SubscriptionRequestRepositoryFactory');

        const categoryRequestRepository = categoryRequestRepoFactory.create();
        const subscriptionRequestRepository = subscriptionRequestRepoFactory.create();

        CategoryControllerFactory.instance = new CategoryController(
            categoryRequestRepository,
            subscriptionRequestRepository
        );

        return CategoryControllerFactory.instance;
    }
}