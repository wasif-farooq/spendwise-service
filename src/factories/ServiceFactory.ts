import { RepositoryFactory } from './RepositoryFactory';
import { RedisFactory } from '@database/factories/RedisFactory';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { CategoryRepository } from '@domains/categories/repositories/CategoryRepository';
import { CategoryService } from '@domains/categories/services/CategoryService';
import { AuthService } from '@domains/auth/services/AuthService';
import { RedisClientType } from 'redis';

export class ServiceFactory {
    private static redisFactory = new RedisFactory();
    private static redisClient: ReturnType<RedisFactory['createClient']> | null = null;
    private static redisConnecting: Promise<void> | null = null;

    constructor(
        private repositoryFactory: RepositoryFactory,
        private db: DatabaseFacade
    ) { }

    private async getRedisClient(): Promise<RedisClientType> {
        if (!ServiceFactory.redisClient) {
            ServiceFactory.redisClient = ServiceFactory.redisFactory.createClient();
            ServiceFactory.redisClient.on('error', (err) => console.error('[Redis] Client error:', err));
            ServiceFactory.redisClient.on('connect', () => console.log('[Redis] Client connected'));

            ServiceFactory.redisConnecting = ServiceFactory.redisClient.connect()
                .then(() => {
                    console.log('[Redis] Connection established');
                    ServiceFactory.redisConnecting = null;
                })
                .catch((err) => {
                    console.error('[Redis] Connection error:', err);
                    ServiceFactory.redisClient = null;
                    ServiceFactory.redisConnecting = null;
                });

            await ServiceFactory.redisConnecting;
        }
        return ServiceFactory.redisClient;
    }

    async createAuthService(): Promise<AuthService> {
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

        const redisClient = await this.getRedisClient();
        const subscriptionService = this.createSubscriptionService();

        return new AuthService(
            this.db,
            this.repositoryFactory.createUserRepository(),
            this.repositoryFactory.createAuthRepository(),
            this.repositoryFactory.createWorkspaceRepository(),
            this.repositoryFactory.createWorkspaceRoleRepository(),
            this.repositoryFactory.createWorkspaceMembersRepository(),
            wsService,
            subscriptionService,
            redisClient
        );
    }

    createUserService() {
        const { UserService } = require('@domains/users/services/UserService');
        const { StorageService } = require('@domains/storage/services/StorageService');
        const { StorageRepository } = require('@domains/storage/repositories/StorageRepository');
        const { ConfigLoader } = require('@config/ConfigLoader');
        
        const config = ConfigLoader.getInstance();
        const storageRepo = new StorageRepository(this.db);
        const storageService = new StorageService(storageRepo, config);
        
        return new UserService(this.repositoryFactory.createUserRepository(), storageService);
    }

    createWorkspaceService() {
        const { WorkspaceService } = require('@domains/workspaces/services/WorkspaceService');
        const { StorageService } = require('@domains/storage/services/StorageService');
        const { StorageRepository } = require('@domains/storage/repositories/StorageRepository');
        const { ConfigLoader } = require('@config/ConfigLoader');

        const config = ConfigLoader.getInstance();
        const storageRepo = new StorageRepository(this.db);
        const storageService = new StorageService(storageRepo, config);

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
            categoryService,
            storageService
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
