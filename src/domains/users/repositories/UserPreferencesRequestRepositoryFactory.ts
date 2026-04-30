import { UserPreferencesRequestRepository } from './UserPreferencesRequestRepository';

export class UserPreferencesRequestRepositoryFactory {
    private static instance: UserPreferencesRequestRepository | null = null;

    create(): UserPreferencesRequestRepository {
        if (UserPreferencesRequestRepositoryFactory.instance) {
            return UserPreferencesRequestRepositoryFactory.instance;
        }

        UserPreferencesRequestRepositoryFactory.instance = new UserPreferencesRequestRepository();
        return UserPreferencesRequestRepositoryFactory.instance;
    }
}