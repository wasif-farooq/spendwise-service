import { TransactionController } from '@domains/transactions/controllers/TransactionController';
import { TransactionRequestRepository } from '@domains/transactions/repositories/TransactionRequestRepository';
import { SubscriptionRequestRepository } from '@domains/subscription/repositories/SubscriptionRequestRepository';

export class TransactionControllerFactory {
    private transactionRequestRepository: TransactionRequestRepository;
    private subscriptionRequestRepository: SubscriptionRequestRepository;

    constructor() {
        this.transactionRequestRepository = new TransactionRequestRepository();
        this.subscriptionRequestRepository = new SubscriptionRequestRepository();
    }

    create(): TransactionController {
        return new TransactionController(
            this.transactionRequestRepository,
            this.subscriptionRequestRepository
        );
    }
}