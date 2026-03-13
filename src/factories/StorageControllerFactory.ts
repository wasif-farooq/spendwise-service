import { StorageController } from '@domains/storage/controllers/StorageController';
import { StorageService } from '@domains/storage/services/StorageService';
import { StorageServiceFactory } from './StorageServiceFactory';
import { ConfigLoader } from '@config/ConfigLoader';

export class StorageControllerFactory {
    private serviceFactory: StorageServiceFactory;

    constructor() {
        this.serviceFactory = new StorageServiceFactory();
    }

    create(): StorageController {
        const service = this.serviceFactory.create();
        const config = ConfigLoader.getInstance();
        return new StorageController(service, config);
    }
}
