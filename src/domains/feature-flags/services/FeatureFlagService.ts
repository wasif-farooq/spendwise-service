import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';
import { FeatureFlagRepository } from  '@domains/feature-flags/repositories/FeatureFlagRepository';
import { FeatureFlag } from  '@domains/feature-flags/models/FeatureFlag';

export class FeatureFlagService {
    constructor(
        @Inject('FeatureFlagRepository') private repo: FeatureFlagRepository
    ) { }

    async getAllFlags(): Promise<Record<string, boolean>> {
        const flags = await this.repo.findAll();
        // Return as key-value pair for easy frontend consumption
        return flags.reduce((acc, flag) => {
            acc[flag.key] = flag.isEnabled;
            return acc;
        }, {} as Record<string, boolean>);
    }

    async isEnabled(key: string): Promise<boolean> {
        const flag = await this.repo.findByKey(key);
        return flag ? flag.isEnabled : false;
    }
}
