import { Container } from '@di/Container';
import { AccountController } from '@domains/accounts/controllers/AccountController';
import { AccountRequestRepositoryFactory } from '@domains/accounts/repositories/AccountRequestRepositoryFactory';
import { SubscriptionRequestRepositoryFactory } from '@domains/subscription/repositories/SubscriptionRequestRepositoryFactory';
import { UserPreferencesRequestRepositoryFactory } from '@domains/users/repositories/UserPreferencesRequestRepositoryFactory';
import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';

export class AccountControllerFactory {
    private static instance: AccountController | null = null;

    create(): AccountController {
        if (AccountControllerFactory.instance) {
            return AccountControllerFactory.instance;
        }

        const accountRequestRepoFactory = Container.getInstance()
            .resolve<AccountRequestRepositoryFactory>('AccountRequestRepositoryFactory');
        const subscriptionRequestRepoFactory = Container.getInstance()
            .resolve<SubscriptionRequestRepositoryFactory>('SubscriptionRequestRepositoryFactory');
        const userPreferencesRequestRepoFactory = Container.getInstance()
            .resolve<UserPreferencesRequestRepositoryFactory>('UserPreferencesRequestRepositoryFactory');

        const accountRequestRepository = accountRequestRepoFactory.create();
        const subscriptionRequestRepository = subscriptionRequestRepoFactory.create();
        const userPreferencesRequestRepository = userPreferencesRequestRepoFactory.create();
        const workspaceRequestRepository = new WorkspaceRequestRepository();

        AccountControllerFactory.instance = new AccountController(
            accountRequestRepository,
            subscriptionRequestRepository,
            userPreferencesRequestRepository,
            workspaceRequestRepository
        );

        return AccountControllerFactory.instance;
    }
}