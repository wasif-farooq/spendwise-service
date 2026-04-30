import { AuthRequestRepository } from './AuthRequestRepository';

export class AuthRequestRepositoryFactory {
    private static instance: AuthRequestRepository | null = null;

    create(): AuthRequestRepository {
        if (AuthRequestRepositoryFactory.instance) {
            return AuthRequestRepositoryFactory.instance;
        }

        AuthRequestRepositoryFactory.instance = new AuthRequestRepository();
        return AuthRequestRepositoryFactory.instance;
    }
}