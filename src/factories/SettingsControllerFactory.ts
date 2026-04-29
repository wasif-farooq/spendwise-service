import { SettingsController } from '@domains/settings/SettingsController';
import { SettingsRequestRepository } from '@domains/settings/repositories/SettingsRequestRepository';

export class SettingsControllerFactory {
    private settingsRequestRepository: SettingsRequestRepository;

    constructor() {
        this.settingsRequestRepository = new SettingsRequestRepository();
    }

    create(): SettingsController {
        return new SettingsController(this.settingsRequestRepository);
    }
}