import { AccountController } from '@domains/accounts/controllers/AccountController';
import { AccountRequestRepository } from '@domains/accounts/repositories/AccountRequestRepository';
import { SubscriptionRequestRepository } from '@domains/subscription/repositories/SubscriptionRequestRepository';
import { UserPreferencesRequestRepository } from '@domains/users/repositories/UserPreferencesRequestRepository';

export class AccountControllerFactory {
    private accountRequestRepository: AccountRequestRepository;
    private subscriptionRequestRepository: SubscriptionRequestRepository;
    private userPreferencesRequestRepository: UserPreferencesRequestRepository;

    constructor() {
        this.accountRequestRepository = new AccountRequestRepository();
        this.subscriptionRequestRepository = new SubscriptionRequestRepository();
        this.userPreferencesRequestRepository = new UserPreferencesRequestRepository();
    }

    create(): AccountController {
        return new AccountController(
            this.accountRequestRepository,
            this.subscriptionRequestRepository,
            this.userPreferencesRequestRepository
        );
    }
}