import { ConfigLoader } from '@config/ConfigLoader';

export type RepositoryMode = 'rpc' | 'direct';

export class RepositoryFactory {
    private static config = ConfigLoader.getInstance();

    static getCurrentMode(): RepositoryMode {
        return (this.config.get('repository.mode') || 'direct') as RepositoryMode;
    }

    // The RequestRepositories now handle the switch internally
    // This factory is kept for backwards compatibility and easy access
    static getAuthRepository(): any {
        const { AuthRequestRepository } = require('../domains/auth/repositories/AuthRequestRepository');
        return new AuthRequestRepository();
    }

    static getUsersRepository(): any {
        const { UserRequestRepository } = require('../domains/users/repositories/UserRequestRepository');
        return new UserRequestRepository();
    }

    static getWorkspaceRepository(): any {
        const { WorkspaceRequestRepository } = require('../domains/workspaces/repositories/WorkspaceRequestRepository');
        return new WorkspaceRequestRepository();
    }

    static getFeatureFlagsRepository(): any {
        const { FeatureFlagRequestRepository } = require('../domains/feature-flags/repositories/FeatureFlagRequestRepository');
        return new FeatureFlagRequestRepository();
    }
}
