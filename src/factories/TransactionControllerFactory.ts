import { Container } from '@di/Container';
import { TransactionController } from '@domains/transactions/controllers/TransactionController';
import { TransactionRequestRepositoryFactory } from '@domains/transactions/repositories/TransactionRequestRepositoryFactory';
import { SubscriptionRequestRepositoryFactory } from '@domains/subscription/repositories/SubscriptionRequestRepositoryFactory';
import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';

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
        const workspaceRequestRepository = new WorkspaceRequestRepository();

        TransactionControllerFactory.instance = new TransactionController(
            transactionRequestRepository,
            subscriptionRequestRepository,
            workspaceRequestRepository
        );

        return TransactionControllerFactory.instance;
    }
}