import { BaseRepository } from '@shared/repositories/BaseRepository';
import { Workspace } from '../models/Workspace';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';

export class WorkspaceRepository extends BaseRepository<Workspace> {
    constructor(@Inject(TOKENS.Database) db: DatabaseFacade) {
        super(db, 'workspaces');
    }
    async findByIds(ids: string[]): Promise<Workspace[]> {
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const query = `SELECT * FROM ${this.tableName} WHERE id IN (${placeholders})`;
        const result = await this.db.query(query, ids);
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    protected mapToEntity(row: any): Workspace {
        return Workspace.restore(
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
