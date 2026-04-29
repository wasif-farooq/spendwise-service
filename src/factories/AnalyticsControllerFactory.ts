import { AnalyticsController } from '@domains/analytics/controllers/AnalyticsController';
import { AnalyticsRequestRepository } from '@domains/analytics/repositories/AnalyticsRequestRepository';

export class AnalyticsControllerFactory {
    private analyticsRequestRepository: AnalyticsRequestRepository;

    constructor() {
        this.analyticsRequestRepository = new AnalyticsRequestRepository();
    }

    create(): AnalyticsController {
        return new AnalyticsController(this.analyticsRequestRepository);
    }
}