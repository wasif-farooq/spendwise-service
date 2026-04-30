import { Container } from '@di/Container';
import { SettingsController } from '@domains/settings/SettingsController';
import { SettingsRequestRepositoryFactory } from '@domains/settings/repositories/SettingsRequestRepositoryFactory';

export class SettingsControllerFactory {
    private static instance: SettingsController | null = null;

    create(): SettingsController {
        if (SettingsControllerFactory.instance) {
            return SettingsControllerFactory.instance;
        }

        const settingsRequestRepoFactory = Container.getInstance()
            .resolve<SettingsRequestRepositoryFactory>('SettingsRequestRepositoryFactory');

        const settingsRequestRepository = settingsRequestRepoFactory.create();

        SettingsControllerFactory.instance = new SettingsController(settingsRequestRepository);

        return SettingsControllerFactory.instance;
    }
}