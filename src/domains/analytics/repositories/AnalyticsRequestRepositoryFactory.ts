import { AnalyticsRequestRepository } from './AnalyticsRequestRepository';

export class AnalyticsRequestRepositoryFactory {
    private static instance: AnalyticsRequestRepository | null = null;

    create(): AnalyticsRequestRepository {
        if (AnalyticsRequestRepositoryFactory.instance) {
            return AnalyticsRequestRepositoryFactory.instance;
        }

        AnalyticsRequestRepositoryFactory.instance = new AnalyticsRequestRepository();
        return AnalyticsRequestRepositoryFactory.instance;
    }
}