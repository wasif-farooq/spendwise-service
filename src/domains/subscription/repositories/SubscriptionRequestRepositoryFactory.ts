import { SubscriptionRequestRepository } from './SubscriptionRequestRepository';

export class SubscriptionRequestRepositoryFactory {
    private static instance: SubscriptionRequestRepository | null = null;

    create(): SubscriptionRequestRepository {
        if (SubscriptionRequestRepositoryFactory.instance) {
            return SubscriptionRequestRepositoryFactory.instance;
        }

        SubscriptionRequestRepositoryFactory.instance = new SubscriptionRequestRepository();
        return SubscriptionRequestRepositoryFactory.instance;
    }
}