import { Container } from '@di/Container';
import { ServiceFactory } from './ServiceFactory';
import { UserRequestRepositoryFactory } from '@domains/users/repositories/UserRequestRepositoryFactory';
import { UserPreferencesRequestRepositoryFactory } from '@domains/users/repositories/UserPreferencesRequestRepositoryFactory';
import { UserController } from '@domains/users/controllers/UserController';

export class UserControllerFactory {
    private static instance: UserController | null = null;

    constructor(private serviceFactory: ServiceFactory) { }

    create(): UserController {
        if (UserControllerFactory.instance) {
            return UserControllerFactory.instance;
        }

        const userRequestRepoFactory = Container.getInstance()
            .resolve<UserRequestRepositoryFactory>('UserRequestRepositoryFactory');
        const userPreferencesRequestRepoFactory = Container.getInstance()
            .resolve<UserPreferencesRequestRepositoryFactory>('UserPreferencesRequestRepositoryFactory');

        const userRequestRepository = userRequestRepoFactory.create();
        const userPreferencesRequestRepository = userPreferencesRequestRepoFactory.create();

        UserControllerFactory.instance = new UserController(
            userRequestRepository
        );

        return UserControllerFactory.instance;
    }
}