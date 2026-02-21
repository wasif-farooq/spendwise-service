import { DatabaseFacade } from '@facades/DatabaseFacade';
import { User } from '../../models/User';
import { UserMapper } from '../../mappers/UserMapper';
import knex from 'knex';

const qb = knex({ client: 'pg' });

/**
 * Query to find a User by their email address.
 */
export class FindUserByEmailQuery {
    constructor(private db: DatabaseFacade) { }

    /**
     * Executes the query.
     * @param email The email to search for.
     * @returns The User entity if found, otherwise null.
     */
    async execute(email: string): Promise<User | null> {
        const { sql, bindings } = qb('users').where({ email }).toSQL().toNative();

        const res = await this.db.query(sql, bindings as any[]);

        if (res.rows.length === 0) return null;
        return UserMapper.toDomain(res.rows[0]);
    }
}
