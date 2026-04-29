import { SubscriptionController } from '@domains/subscription/controllers/SubscriptionController';
import { SubscriptionRequestRepository } from '@domains/subscription/repositories/SubscriptionRequestRepository';
import { AccountRequestRepository } from '@domains/accounts/repositories/AccountRequestRepository';

export class SubscriptionControllerFactory {
    private subscriptionRequestRepository: SubscriptionRequestRepository;
    private accountRequestRepository: AccountRequestRepository;

    constructor() {
        this.subscriptionRequestRepository = new SubscriptionRequestRepository();
        this.accountRequestRepository = new AccountRequestRepository();
    }

    create(): SubscriptionController {
        return new SubscriptionController(
            this.subscriptionRequestRepository,
            this.accountRequestRepository
        );
    }
}