import { DatabaseFacade } from '@facades/DatabaseFacade';
import { User } from '../../models/User';
import { UserMapper } from '../../mappers/UserMapper';
import knex from 'knex';

const qb = knex({ client: 'pg' });

/**
 * Query to find a User by their unique ID.
 */
export class FindUserByIdQuery {
    constructor(private db: DatabaseFacade) { }

    /**
     * Executes the query.
     * @param id The User ID.
     * @returns The User entity if found, otherwise null.
     */
    async execute(id: string): Promise<User | null> {
        const { sql, bindings } = qb('users').where({ id }).toSQL().toNative();

        const res = await this.db.query(sql, bindings as any[]);

        if (res.rows.length === 0) return null;
        return UserMapper.toDomain(res.rows[0]);
    }
}
