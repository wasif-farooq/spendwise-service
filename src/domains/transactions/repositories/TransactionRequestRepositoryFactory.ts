import { TransactionRequestRepository } from './TransactionRequestRepository';

export class TransactionRequestRepositoryFactory {
    private static instance: TransactionRequestRepository | null = null;

    create(): TransactionRequestRepository {
        if (TransactionRequestRepositoryFactory.instance) {
            return TransactionRequestRepositoryFactory.instance;
        }

        TransactionRequestRepositoryFactory.instance = new TransactionRequestRepository();
        return TransactionRequestRepositoryFactory.instance;
    }
}