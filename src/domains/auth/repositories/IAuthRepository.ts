import { AuthIdentity } from '../models/AuthIdentity';

import { DatabaseFacade } from '@facades/DatabaseFacade';

export interface IAuthRepository {
    save(identity: AuthIdentity, options?: { db?: DatabaseFacade }): Promise<void>;
    findByUserIdAndProvider(userId: string, provider: string, options?: { db?: DatabaseFacade }): Promise<AuthIdentity | null>;
    findByProviderAndSub(provider: string, sub: string, options?: { db?: DatabaseFacade }): Promise<AuthIdentity | null>;
}
