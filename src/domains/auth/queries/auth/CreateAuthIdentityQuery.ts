import { DatabaseFacade } from '@facades/DatabaseFacade';
import { AuthIdentity } from '../../models/AuthIdentity';
import knex from 'knex';

const qb = knex({ client: 'pg' });

/**
 * Query to persist a new AuthIdentity.
 */
export class CreateAuthIdentityQuery {
    constructor(private db: DatabaseFacade) { }

    /**
     * Executes the insert query.
     */
    async execute(identity: AuthIdentity): Promise<void> {
        const { sql, bindings } = qb('auth_identities').insert({
            id: identity.id,
            user_id: identity.userId,
            provider: identity.provider,
            sub: identity.getProps().sub,
            password_hash: identity.passwordHash,
            created_at: new Date(),
            last_login_at: identity.getProps().lastLoginAt
        }).toSQL().toNative();

        await this.db.query(sql, bindings as any[]);
    }
}
