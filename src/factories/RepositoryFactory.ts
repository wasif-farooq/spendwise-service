import { DatabaseFacade } from '@facades/DatabaseFacade';
import { IUserRepository } from '@domains/auth/repositories/IUserRepository';
import { IAuthRepository } from '@domains/auth/repositories/IAuthRepository';
import { UserRepository } from '@domains/auth/repositories/UserRepository';
import { AuthRepository } from '@domains/auth/repositories/AuthRepository';
import { OrganizationRepository } from '@domains/organizations/repositories/OrganizationRepository';
import { OrganizationRoleRepository } from '@domains/organizations/repositories/OrganizationRoleRepository';
import { OrganizationMembersRepository } from '@domains/organizations/repositories/OrganizationMembersRepository';
import { UserPreferencesRepository } from '@domains/users/repositories/UserPreferencesRepository';
import { FeatureFlagRepository } from '@domains/feature-flags/repositories/FeatureFlagRepository';
import { SubscriptionPlanRepository, OrganizationSubscriptionRepository } from '@domains/subscription/repositories/SubscriptionRepository';


export class RepositoryFactory {
    constructor(private db: DatabaseFacade) { }

    createUserRepository(): IUserRepository {
        return new UserRepository(this.db);
    }

    createAuthRepository(): IAuthRepository {
        return new AuthRepository(this.db);
    }

    createOrganizationRepository(): OrganizationRepository {
        return new OrganizationRepository(this.db);
    }

    createOrganizationRoleRepository(): OrganizationRoleRepository {
        return new OrganizationRoleRepository(this.db);
    }

    createOrganizationMembersRepository(): OrganizationMembersRepository {
        return new OrganizationMembersRepository(this.db);
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

    createOrganizationSubscriptionRepository(): OrganizationSubscriptionRepository {
        return new OrganizationSubscriptionRepository(this.db);
    }
}
