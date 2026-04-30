import { Container } from '@di/Container';
import { TransactionController } from '@domains/transactions/controllers/TransactionController';
import { TransactionRequestRepositoryFactory } from '@domains/transactions/repositories/TransactionRequestRepositoryFactory';
import { SubscriptionRequestRepositoryFactory } from '@domains/subscription/repositories/SubscriptionRequestRepositoryFactory';

export class TransactionControllerFactory {
    private static instance: TransactionController | null = null;

    create(): TransactionController {
        if (TransactionControllerFactory.instance) {
            return TransactionControllerFactory.instance;
        }

        const transactionRequestRepoFactory = Container.getInstance()
            .resolve<TransactionRequestRepositoryFactory>('TransactionRequestRepositoryFactory');
        const subscriptionRequestRepoFactory = Container.getInstance()
            .resolve<SubscriptionRequestRepositoryFactory>('SubscriptionRequestRepositoryFactory');

        const transactionRequestRepository = transactionRequestRepoFactory.create();
        const subscriptionRequestRepository = subscriptionRequestRepoFactory.create();

        TransactionControllerFactory.instance = new TransactionController(
            transactionRequestRepository,
            subscriptionRequestRepository
        );

        return TransactionControllerFactory.instance;
    }
}