import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { ServiceFactory } from '@factories/ServiceFactory';
import { AnalyticsService, AnalyticsFilters } from '../services/AnalyticsService';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

export class AnalyticsRequestRepository {
    private config = ConfigLoader.getInstance();
    private cachedService: AnalyticsService | null = null;
    private servicePromise: Promise<AnalyticsService> | null = null;

    private getMode(): string {
        return this.config.get('repository.mode') || 'direct';
    }

    private async getService(): Promise<AnalyticsService> {
        if (this.cachedService) {
            return this.cachedService;
        }

        if (this.servicePromise) {
            return this.servicePromise;
        }

        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const repoFactory = new RepositoryFactory(db);
        const serviceFactory = new ServiceFactory(repoFactory, db);

        this.servicePromise = serviceFactory.createAnalyticsService().then((service: AnalyticsService) => {
            this.cachedService = service;
            this.servicePromise = null;
            return service;
        });

        return this.servicePromise;
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

    async getOverview(workspaceId: string, userId: string, filters?: AnalyticsFilters) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.getOverview(workspaceId, 'month', filters));
        }
        throw new Error('RPC mode not implemented');
    }

    async getCategoryTrends(workspaceId: string, userId: string, filters?: AnalyticsFilters) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.getCategoryTrends(workspaceId, 6, filters));
        }
        throw new Error('RPC mode not implemented');
    }

    async getMonthlyComparison(workspaceId: string, userId: string, months: number) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.getMonthlyComparison(workspaceId, months));
        }
        throw new Error('RPC mode not implemented');
    }

    async getSpendingTrend(workspaceId: string, period: string, filters?: AnalyticsFilters) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.getSpendingTrend(workspaceId, period, filters));
        }
        throw new Error('RPC mode not implemented');
    }

    async getTopMerchants(workspaceId: string, userId: string, limit: number) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.getTopMerchants(workspaceId, 'month', limit));
        }
        throw new Error('RPC mode not implemented');
    }
}