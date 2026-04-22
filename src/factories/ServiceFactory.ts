import { RepositoryFactory } from './RepositoryFactory';
import { RedisFactory } from '@database/factories/RedisFactory';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { CategoryRepository } from '@domains/categories/repositories/CategoryRepository';
import { CategoryService } from '@domains/categories/services/CategoryService';

export class ServiceFactory {
    private redisFactory = new RedisFactory();
    private redisClient: ReturnType<RedisFactory['createClient']> | null = null;

    constructor(
        private repositoryFactory: RepositoryFactory,
        private db: DatabaseFacade
    ) { }

    private getRedisClient() {
        if (!this.redisClient) {
            this.redisClient = this.redisFactory.createClient();
            this.redisClient.connect().catch(console.error);
        }
        return this.redisClient;
    }

    createAuthService() {
        const { AuthService } = require('@domains/auth/services/AuthService');
        const { WorkspaceService } = require('@domains/workspaces/services/WorkspaceService');

        const categoryRepo = new CategoryRepository(this.db);
        const categoryService = new CategoryService(categoryRepo, this.repositoryFactory.createTransactionRepository());
        const wsService = new WorkspaceService(
            this.repositoryFactory.createWorkspaceRepository(),
            this.repositoryFactory.createWorkspaceMembersRepository(),
            this.repositoryFactory.createWorkspaceRoleRepository(),
            this.repositoryFactory.createWorkspaceInvitationsRepository(),
            this.repositoryFactory.createUserRepository(),
            null as any,
            this.db,
            this.repositoryFactory.createAccountRepository(),
            this.repositoryFactory.createTransactionRepository(),
            categoryRepo,
            categoryService
        );

        return new AuthService(
            this.db,
            this.repositoryFactory.createUserRepository(),
            this.repositoryFactory.createAuthRepository(),
            this.repositoryFactory.createWorkspaceRepository(),
            this.repositoryFactory.createWorkspaceRoleRepository(),
            this.repositoryFactory.createWorkspaceMembersRepository(),
            wsService,
            this.getRedisClient()
        );
    }

    createUserService() {
        const { UserService } = require('@domains/users/services/UserService');
        return new UserService(this.repositoryFactory.createUserRepository());
    }

    createWorkspaceService() {
        const { WorkspaceService } = require('@domains/workspaces/services/WorkspaceService');

        const categoryRepo = new CategoryRepository(this.db);
        const categoryService = new CategoryService(categoryRepo, this.repositoryFactory.createTransactionRepository());

        return new WorkspaceService(
            this.repositoryFactory.createWorkspaceRepository(),
            this.repositoryFactory.createWorkspaceMembersRepository(),
            this.repositoryFactory.createWorkspaceRoleRepository(),
            this.repositoryFactory.createWorkspaceInvitationsRepository(),
            this.repositoryFactory.createUserRepository(),
            null as any,
            this.db,
            this.repositoryFactory.createAccountRepository(),
            this.repositoryFactory.createTransactionRepository(),
            categoryRepo,
            categoryService
        );
    }

    createUserPreferencesService() {
        const { UserPreferencesService } = require('@domains/users/services/UserPreferencesService');
        return new UserPreferencesService(this.repositoryFactory.createUserPreferencesRepository());
    }

    createFeatureFlagService() {
        const { FeatureFlagService } = require('@domains/feature-flags/services/FeatureFlagService');
        return new FeatureFlagService(this.repositoryFactory.createFeatureFlagRepository());
    }

    createSubscriptionService() {
        const { SubscriptionService } = require('@domains/subscription/services/SubscriptionService');
        return new SubscriptionService(
            this.repositoryFactory.createSubscriptionPlanRepository(),
            this.repositoryFactory.createUserSubscriptionRepository()
        );
    }
}
