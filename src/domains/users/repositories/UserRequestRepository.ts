import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { PostgresFactory } from '@database/factories/PostgresFactory';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { ServiceFactory } from '@factories/ServiceFactory';

export class UserRequestRepository {
    private config = ConfigLoader.getInstance();
    private getMode(): string {
        return this.config.get('repository.mode') || 'direct';
    }

    private get service() {
        const db = new DatabaseFacade(new PostgresFactory());
        const repoFactory = new RepositoryFactory(db);
        const serviceFactory = new ServiceFactory(repoFactory, db);
        return serviceFactory.createUserService();
    }

    private get preferencesService() {
        const db = new DatabaseFacade(new PostgresFactory());
        const repoFactory = new RepositoryFactory(db);
        const serviceFactory = new ServiceFactory(repoFactory, db);
        return serviceFactory.createUserPreferencesService();
    }

    // Helper to wrap responses in RPC-style format
    private wrap(promise: Promise<any>): Promise<any> {
        return promise
            .then(data => ({ ...data, error: null, statusCode: 200 }))
            .catch(error => ({ 
                error: error.message || 'An error occurred', 
                statusCode: error.statusCode || 500,
                data: null 
            }));
    }

    async getProfile(userId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.getProfile(userId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async updateProfile(userId: string, data: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.updateProfile(userId, data));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async getPreferences(userId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.preferencesService.getPreferences(userId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async updatePreferences(userId: string, data: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.preferencesService.updatePreferences(userId, data));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }
}
