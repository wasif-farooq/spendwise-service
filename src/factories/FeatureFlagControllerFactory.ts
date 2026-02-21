import { ServiceFactory } from './ServiceFactory';
import { FeatureFlagController } from '@domains/feature-flags/controllers/FeatureFlagController';
import { FeatureFlagRequestRepository } from '@domains/feature-flags/repositories/FeatureFlagRequestRepository';

export class FeatureFlagControllerFactory {
    // Note: Feature Flags API currently uses RPC to Worker just like others to be consistent,
    // although it could be direct. We stick to architecture.
    constructor(private serviceFactory: ServiceFactory) { }

    create(): FeatureFlagController {
        // In the API Gateway process, we use the RequestRepository to talk to the Worker
        const requestRepository = new FeatureFlagRequestRepository();
        return new FeatureFlagController(requestRepository);
    }
}
