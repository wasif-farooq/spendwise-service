import { RepositoryFactory } from './RepositoryFactory';
import { RedisFactory } from '@database/factories/RedisFactory';
import { AuthService } from '@domains/auth/services/AuthService';
import { UserService } from '@domains/users/services/UserService';
import { UserPreferencesService } from '@domains/users/services/UserPreferencesService';
import { FeatureFlagService } from '@domains/feature-flags/services/FeatureFlagService';
import { SubscriptionService } from '@domains/subscription/services/SubscriptionService';
import { DatabaseFacade } from '@facades/DatabaseFacade';


export class ServiceFactory {
    private redisFactory = new RedisFactory();

    constructor(
        private repositoryFactory: RepositoryFactory,
        private db: DatabaseFacade
    ) { }

    createAuthService(): AuthService {
        const redisInfo = this.redisFactory.createClient();
        redisInfo.connect().catch(console.error); // Lazy connect

        return new AuthService(
            this.db,
            this.repositoryFactory.createUserRepository(),
            this.repositoryFactory.createAuthRepository(),
            this.repositoryFactory.createWorkspaceRepository(),
            this.repositoryFactory.createWorkspaceRoleRepository(),
            this.repositoryFactory.createWorkspaceMembersRepository(),
            redisInfo
        );
    }

    createUserService(): UserService {
        return new UserService(
            this.repositoryFactory.createUserRepository()
        );
    }

    createWorkspaceService(): import('@domains/workspaces/services/WorkspaceService').WorkspaceService {
        return new (require('@domains/workspaces/services/WorkspaceService').WorkspaceService)(
            this.repositoryFactory.createWorkspaceRepository(),
            this.repositoryFactory.createWorkspaceMembersRepository(),
            this.repositoryFactory.createWorkspaceRoleRepository(),
            this.repositoryFactory.createUserRepository()
        );
    }

    createUserPreferencesService(): UserPreferencesService {
        return new UserPreferencesService(
            this.repositoryFactory.createUserPreferencesRepository()
        );
    }

    createFeatureFlagService(): FeatureFlagService {
        return new FeatureFlagService(
            this.repositoryFactory.createFeatureFlagRepository()
        );
    }

    createSubscriptionService(): SubscriptionService {
        return new SubscriptionService(
            this.repositoryFactory.createSubscriptionPlanRepository(),
            this.repositoryFactory.createUserSubscriptionRepository()
        );
    }
}
