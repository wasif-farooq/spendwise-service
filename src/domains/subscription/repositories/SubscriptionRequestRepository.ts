import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { ServiceFactory } from '@factories/ServiceFactory';
import { SubscriptionService } from '../services/SubscriptionService';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

export class SubscriptionRequestRepository {
    private config = ConfigLoader.getInstance();

    private getMode(): string {
        return this.config.get('repository.mode') || 'direct';
    }

    private getService(): SubscriptionService {
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const repoFactory = new RepositoryFactory(db);
        const serviceFactory = new ServiceFactory(repoFactory, db);
        return serviceFactory.createSubscriptionService();
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

    async getPlans() {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.getPlans());
        }
        throw new Error('RPC mode not implemented');
    }

    async getCurrentSubscription(userId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.getCurrentSubscription(userId));
        }
        throw new Error('RPC mode not implemented');
    }

    async subscribe(userId: string, data: { planId: string; paymentMethodId: string }) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.subscribe(userId, data.planId, { provider: data.paymentMethodId || '2checkout', subscriptionId: `sub_${Date.now()}` }));
        }
        throw new Error('RPC mode not implemented');
    }

    async cancel(userId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            const sub = await service.getCurrentSubscription(userId);
            if (sub) {
                return this.wrap(Promise.resolve({ ...sub, status: 'cancelled', cancelledAt: new Date() }));
            }
            return this.wrap(Promise.resolve(null));
        }
        throw new Error('RPC mode not implemented');
    }

    async checkFeatureLimit(userId: string, feature: string, currentCount: number): Promise<void> {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return service.checkFeatureLimit(userId, feature, currentCount);
        }
        throw new Error('RPC mode not implemented');
    }

    async checkAccountTransactionLimit(userId: string, accountId: string, currentMonthCount: number): Promise<void> {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return service.checkAccountTransactionLimit(userId, accountId, currentMonthCount);
        }
        throw new Error('RPC mode not implemented');
    }

    async checkTransactionHistoryLimit(userId: string, startDate: string | undefined): Promise<void> {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return service.checkTransactionHistoryLimit(userId, startDate);
        }
        throw new Error('RPC mode not implemented');
    }

    async upgrade(userId: string, planId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.upgrade(userId, planId));
        }
        throw new Error('RPC mode not implemented');
    }

    async downgrade(userId: string, planId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.downgrade(userId, planId));
        }
        throw new Error('RPC mode not implemented');
    }
}