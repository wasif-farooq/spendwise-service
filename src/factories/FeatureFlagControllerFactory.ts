import { Container } from '@di/Container';
import { ServiceFactory } from './ServiceFactory';
import { FeatureFlagController } from '@domains/feature-flags/controllers/FeatureFlagController';
import { FeatureFlagRequestRepositoryFactory } from '@domains/feature-flags/repositories/FeatureFlagRequestRepositoryFactory';

export class FeatureFlagControllerFactory {
    private static instance: FeatureFlagController | null = null;

    constructor(private serviceFactory: ServiceFactory) { }

    create(): FeatureFlagController {
        if (FeatureFlagControllerFactory.instance) {
            return FeatureFlagControllerFactory.instance;
        }

        const featureFlagRequestRepoFactory = Container.getInstance()
            .resolve<FeatureFlagRequestRepositoryFactory>('FeatureFlagRequestRepositoryFactory');

        const featureFlagRequestRepository = featureFlagRequestRepoFactory.create();

        FeatureFlagControllerFactory.instance = new FeatureFlagController(featureFlagRequestRepository);

        return FeatureFlagControllerFactory.instance;
    }
}