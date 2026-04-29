import { CategoryController } from '@domains/categories/controllers/CategoryController';
import { CategoryRequestRepository } from '@domains/categories/repositories/CategoryRequestRepository';
import { SubscriptionRequestRepository } from '@domains/subscription/repositories/SubscriptionRequestRepository';

export class CategoryControllerFactory {
    private categoryRequestRepository: CategoryRequestRepository;
    private subscriptionRequestRepository: SubscriptionRequestRepository;

    constructor() {
        this.categoryRequestRepository = new CategoryRequestRepository();
        this.subscriptionRequestRepository = new SubscriptionRequestRepository();
    }

    create(): CategoryController {
        return new CategoryController(
            this.categoryRequestRepository,
            this.subscriptionRequestRepository
        );
    }
}