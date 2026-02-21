import { DatabaseFacade } from '@facades/DatabaseFacade';
import { AuthIdentity } from '../../models/AuthIdentity';
import { AuthIdentityMapper } from '../../mappers/AuthIdentityMapper';
import knex from 'knex';

const qb = knex({ client: 'pg' });

/**
 * Query to find AuthIdentity records by various criteria.
 */
export class FindAuthIdentityQuery {
    constructor(private db: DatabaseFacade) { }

    /**
     * Finds identity by User ID and Provider.
     */
    async byUserIdAndProvider(userId: string, provider: string): Promise<AuthIdentity | null> {
        const { sql, bindings } = qb('auth_identities')
            .where({ user_id: userId, provider })
            .toSQL().toNative();

        const res = await this.db.query(sql, bindings as any[]);
        if (res.rows.length === 0) return null;
        return AuthIdentityMapper.toDomain(res.rows[0]);
    }

    /**
     * Finds identity by Provider and Subject (sub).
     */
    async byProviderAndSub(provider: string, sub: string): Promise<AuthIdentity | null> {
        const { sql, bindings } = qb('auth_identities')
            .where({ provider, sub })
            .toSQL().toNative();

        const res = await this.db.query(sql, bindings as any[]);
        if (res.rows.length === 0) return null;
        return AuthIdentityMapper.toDomain(res.rows[0]);
    }

    /**
     * Finds identity by its primary ID.
     */
    async byId(id: string): Promise<AuthIdentity | null> {
        const { sql, bindings } = qb('auth_identities')
            .where({ id })
            .toSQL().toNative();

        const res = await this.db.query(sql, bindings as any[]);
        if (res.rows.length === 0) return null;
        return AuthIdentityMapper.toDomain(res.rows[0]);
    }
}
