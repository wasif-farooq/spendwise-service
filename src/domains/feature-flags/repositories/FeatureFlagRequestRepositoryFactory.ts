import { FeatureFlagRequestRepository } from './FeatureFlagRequestRepository';

export class FeatureFlagRequestRepositoryFactory {
    private static instance: FeatureFlagRequestRepository | null = null;

    create(): FeatureFlagRequestRepository {
        if (FeatureFlagRequestRepositoryFactory.instance) {
            return FeatureFlagRequestRepositoryFactory.instance;
        }

        FeatureFlagRequestRepositoryFactory.instance = new FeatureFlagRequestRepository();
        return FeatureFlagRequestRepositoryFactory.instance;
    }
}