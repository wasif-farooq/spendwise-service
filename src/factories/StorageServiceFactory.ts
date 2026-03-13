import { StorageService } from '@domains/storage/services/StorageService';
import { StorageRepository } from '@domains/storage/repositories/StorageRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { ConfigLoader } from '@config/ConfigLoader';
import { TOKENS } from '@di/tokens';
import { Container } from '@di/Container';

export class StorageServiceFactory {
    create(): StorageService {
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const config = Container.getInstance().resolve<ConfigLoader>(TOKENS.Config);
        
        const repository = new StorageRepository(db);
        return new StorageService(repository, config);
    }
}
