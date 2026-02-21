import { DatabaseFacade } from '@facades/DatabaseFacade';
import { AuthIdentity } from '../../models/AuthIdentity';
import knex from 'knex';

const qb = knex({ client: 'pg' });

/**
 * Query to update an existing AuthIdentity.
 */
export class UpdateAuthIdentityQuery {
    constructor(private db: DatabaseFacade) { }

    /**
     * Executes the update query.
     */
    async execute(identity: AuthIdentity): Promise<void> {
        const { sql, bindings } = qb('auth_identities')
            .where({ id: identity.id })
            .update({
                password_hash: identity.passwordHash,
                last_login_at: identity.getProps().lastLoginAt
            })
            .toSQL().toNative();

        await this.db.query(sql, bindings as any[]);
    }
}
