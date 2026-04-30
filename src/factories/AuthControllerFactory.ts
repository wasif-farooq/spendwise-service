import { Container } from '@di/Container';
import { ServiceFactory } from './ServiceFactory';
import { AuthController } from '@domains/auth/controllers/AuthController';
import { AuthRequestRepositoryFactory } from '@domains/auth/repositories/AuthRequestRepositoryFactory';

export class AuthControllerFactory {
    private static instance: AuthController | null = null;

    constructor(private serviceFactory: ServiceFactory) { }

    create(): AuthController {
        if (AuthControllerFactory.instance) {
            return AuthControllerFactory.instance;
        }

        const authRequestRepoFactory = Container.getInstance()
            .resolve<AuthRequestRepositoryFactory>('AuthRequestRepositoryFactory');

        const authRequestRepository = authRequestRepoFactory.create();

        AuthControllerFactory.instance = new AuthController(authRequestRepository);

        return AuthControllerFactory.instance;
    }
}