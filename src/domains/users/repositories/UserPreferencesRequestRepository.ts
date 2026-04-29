import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { ServiceFactory } from '@factories/ServiceFactory';
import { UserPreferencesService } from '../services/UserPreferencesService';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

export class UserPreferencesRequestRepository {
    private config = ConfigLoader.getInstance();
    private cachedService!: UserPreferencesService;

    private getMode(): string {
        return this.config.get('repository.mode') || 'direct';
    }

    private getService(): UserPreferencesService {
        if (this.cachedService) {
            return this.cachedService;
        }

        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const repoFactory = new RepositoryFactory(db);
        const serviceFactory = new ServiceFactory(repoFactory, db);

        this.cachedService = serviceFactory.createUserPreferencesService();
        return this.cachedService;
    }

    private wrap(promise: Promise<any>): Promise<any> {
        return promise
            .then(data => ({ data, error: null, statusCode: 200 }))
            .catch(error => ({
                error: error.message || 'An error occurred',
                statusCode: error.statusCode || 500,
                data: null
            }));
    }

    async getPreferences(userId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            const prefs = await service.getPreferences(userId);
            return this.wrap(Promise.resolve(prefs.toDTO()));
        }
        throw new Error('RPC mode not implemented');
    }

    async updatePreferences(userId: string, data: any) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            const prefs = await service.updatePreferences(userId, data);
            return this.wrap(Promise.resolve(prefs.toDTO()));
        }
        throw new Error('RPC mode not implemented');
    }
}