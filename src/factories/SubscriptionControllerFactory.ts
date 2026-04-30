import { Container } from '@di/Container';
import { SubscriptionController } from '@domains/subscription/controllers/SubscriptionController';
import { SubscriptionRequestRepositoryFactory } from '@domains/subscription/repositories/SubscriptionRequestRepositoryFactory';
import { AccountRequestRepositoryFactory } from '@domains/accounts/repositories/AccountRequestRepositoryFactory';

export class SubscriptionControllerFactory {
    private static instance: SubscriptionController | null = null;

    create(): SubscriptionController {
        if (SubscriptionControllerFactory.instance) {
            return SubscriptionControllerFactory.instance;
        }

        const subscriptionRequestRepoFactory = Container.getInstance()
            .resolve<SubscriptionRequestRepositoryFactory>('SubscriptionRequestRepositoryFactory');
        const accountRequestRepoFactory = Container.getInstance()
            .resolve<AccountRequestRepositoryFactory>('AccountRequestRepositoryFactory');

        const subscriptionRequestRepository = subscriptionRequestRepoFactory.create();
        const accountRequestRepository = accountRequestRepoFactory.create();

        SubscriptionControllerFactory.instance = new SubscriptionController(
            subscriptionRequestRepository,
            accountRequestRepository
        );

        return SubscriptionControllerFactory.instance;
    }
}