import { Container } from '@di/Container';
import { AnalyticsController } from '@domains/analytics/controllers/AnalyticsController';
import { AnalyticsRequestRepositoryFactory } from '@domains/analytics/repositories/AnalyticsRequestRepositoryFactory';
import { SubscriptionRequestRepositoryFactory } from '@domains/subscription/repositories/SubscriptionRequestRepositoryFactory';
import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';

export class AnalyticsControllerFactory {
    private static instance: AnalyticsController | null = null;

    create(): AnalyticsController {
        if (AnalyticsControllerFactory.instance) {
            return AnalyticsControllerFactory.instance;
        }

        const analyticsRequestRepoFactory = Container.getInstance()
            .resolve<AnalyticsRequestRepositoryFactory>('AnalyticsRequestRepositoryFactory');
        const subscriptionRequestRepoFactory = Container.getInstance()
            .resolve<SubscriptionRequestRepositoryFactory>('SubscriptionRequestRepositoryFactory');

        const analyticsRequestRepository = analyticsRequestRepoFactory.create();
        const subscriptionRequestRepository = subscriptionRequestRepoFactory.create();
        const workspaceRequestRepository = new WorkspaceRequestRepository();

        AnalyticsControllerFactory.instance = new AnalyticsController(
            analyticsRequestRepository,
            subscriptionRequestRepository,
            workspaceRequestRepository
        );

        return AnalyticsControllerFactory.instance;
    }
}