import { BaseRepository } from '@shared/repositories/BaseRepository';
import { Organization } from '../models/Organization';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';

export class OrganizationRepository extends BaseRepository<Organization> {
    constructor(@Inject(TOKENS.Database) db: DatabaseFacade) {
        super(db, 'organizations');
    }
    async findByIds(ids: string[]): Promise<Organization[]> {
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const query = `SELECT * FROM ${this.tableName} WHERE id IN (${placeholders})`;
        const result = await this.db.query(query, ids);
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    protected mapToEntity(row: any): Organization {
        return Organization.restore(
            {
                name: row.name,
                slug: row.slug,
                ownerId: row.owner_id,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at),
            },
            row.id
        );
    }
}

