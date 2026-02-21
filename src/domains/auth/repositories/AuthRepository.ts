import { IAuthRepository } from './IAuthRepository';
import { AuthIdentity } from '../models/AuthIdentity';
import { BaseRepository } from '@shared/repositories/BaseRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';
import { FindAuthIdentityQuery } from '../queries/auth/FindAuthIdentityQuery';
import { CreateAuthIdentityQuery } from '../queries/auth/CreateAuthIdentityQuery';
import { UpdateAuthIdentityQuery } from '../queries/auth/UpdateAuthIdentityQuery';

export class AuthRepository extends BaseRepository<any> implements IAuthRepository {
    constructor(@Inject(TOKENS.Database) db: DatabaseFacade) {
        super(db, 'auth_identities');
    }

    async save(identity: AuthIdentity, options?: { db?: DatabaseFacade }): Promise<void> {
        // Upsert logic simplified by checking existence using the query class
        // In a high-concurrency real app, prefer ON CONFLICT DO UPDATE
        const db = options?.db || this.db;
        const finder = new FindAuthIdentityQuery(db);
        const exists = await finder.byId(identity.id);

        if (exists) {
            await new UpdateAuthIdentityQuery(db).execute(identity);
        } else {
            await new CreateAuthIdentityQuery(db).execute(identity);
        }
    }

    async findByUserIdAndProvider(userId: string, provider: string, options?: { db?: DatabaseFacade }): Promise<AuthIdentity | null> {
        const db = options?.db || this.db;
        return new FindAuthIdentityQuery(db).byUserIdAndProvider(userId, provider);
    }

    async findByProviderAndSub(provider: string, sub: string, options?: { db?: DatabaseFacade }): Promise<AuthIdentity | null> {
        const db = options?.db || this.db;
        return new FindAuthIdentityQuery(db).byProviderAndSub(provider, sub);
    }
}
