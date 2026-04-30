import { SettingsRequestRepository } from './SettingsRequestRepository';

export class SettingsRequestRepositoryFactory {
    private static instance: SettingsRequestRepository | null = null;

    create(): SettingsRequestRepository {
        if (SettingsRequestRepositoryFactory.instance) {
            return SettingsRequestRepositoryFactory.instance;
        }

        SettingsRequestRepositoryFactory.instance = new SettingsRequestRepository();
        return SettingsRequestRepositoryFactory.instance;
    }
}