import { UserRequestRepository } from './UserRequestRepository';

export class UserRequestRepositoryFactory {
    private static instance: UserRequestRepository | null = null;

    create(): UserRequestRepository {
        if (UserRequestRepositoryFactory.instance) {
            return UserRequestRepositoryFactory.instance;
        }

        UserRequestRepositoryFactory.instance = new UserRequestRepository();
        return UserRequestRepositoryFactory.instance;
    }
}