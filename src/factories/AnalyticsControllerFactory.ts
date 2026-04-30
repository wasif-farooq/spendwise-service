import { Container } from '@di/Container';
import { AnalyticsController } from '@domains/analytics/controllers/AnalyticsController';
import { AnalyticsRequestRepositoryFactory } from '@domains/analytics/repositories/AnalyticsRequestRepositoryFactory';

export class AnalyticsControllerFactory {
    private static instance: AnalyticsController | null = null;

    create(): AnalyticsController {
        if (AnalyticsControllerFactory.instance) {
            return AnalyticsControllerFactory.instance;
        }

        const analyticsRequestRepoFactory = Container.getInstance()
            .resolve<AnalyticsRequestRepositoryFactory>('AnalyticsRequestRepositoryFactory');

        const analyticsRequestRepository = analyticsRequestRepoFactory.create();

        AnalyticsControllerFactory.instance = new AnalyticsController(analyticsRequestRepository);

        return AnalyticsControllerFactory.instance;
    }
}