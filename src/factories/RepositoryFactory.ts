import { DatabaseFacade } from '@facades/DatabaseFacade';
import { IUserRepository } from '@domains/auth/repositories/IUserRepository';
import { IAuthRepository } from '@domains/auth/repositories/IAuthRepository';
import { UserRepository } from '@domains/auth/repositories/UserRepository';
import { AuthRepository } from '@domains/auth/repositories/AuthRepository';
import { WorkspaceRepository } from '@domains/workspaces/repositories/WorkspaceRepository';
import { WorkspaceRoleRepository } from '@domains/workspaces/repositories/WorkspaceRoleRepository';
import { WorkspaceMembersRepository } from '@domains/workspaces/repositories/WorkspaceMembersRepository';
import { UserPreferencesRepository } from '@domains/users/repositories/UserPreferencesRepository';
import { FeatureFlagRepository } from '@domains/feature-flags/repositories/FeatureFlagRepository';
import { SubscriptionPlanRepository, UserSubscriptionRepository } from '@domains/subscription/repositories/SubscriptionRepository';
import { AccountRepository } from '@domains/accounts/repositories/AccountRepository';
import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { CategoryRepository } from '@domains/categories/repositories/CategoryRepository';


export class RepositoryFactory {
    constructor(private db: DatabaseFacade) { }

    createUserRepository(): IUserRepository {
        return new UserRepository(this.db);
    }

    createAuthRepository(): IAuthRepository {
        return new AuthRepository(this.db);
    }

    createWorkspaceRepository(): WorkspaceRepository {
        return new WorkspaceRepository(this.db);
    }

    createWorkspaceRoleRepository(): WorkspaceRoleRepository {
        return new WorkspaceRoleRepository(this.db);
    }

    createWorkspaceMembersRepository(): WorkspaceMembersRepository {
        return new WorkspaceMembersRepository(this.db);
    }

    createUserPreferencesRepository(): UserPreferencesRepository {
        return new UserPreferencesRepository(this.db);
    }

    createFeatureFlagRepository(): FeatureFlagRepository {
        return new FeatureFlagRepository(this.db);
    }

    createSubscriptionPlanRepository(): SubscriptionPlanRepository {
        return new SubscriptionPlanRepository(this.db);
    }

    createUserSubscriptionRepository(): UserSubscriptionRepository {
        return new UserSubscriptionRepository(this.db);
    }

    createAccountRepository(): AccountRepository {
        return new AccountRepository(this.db);
    }

    createTransactionRepository(): TransactionRepository {
        return new TransactionRepository(this.db);
    }

    createCategoryRepository(): CategoryRepository {
        return new CategoryRepository(this.db);
    }
}
