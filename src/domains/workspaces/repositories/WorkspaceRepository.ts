import { BaseRepository } from '@shared/repositories/BaseRepository';
import { Workspace } from '../models/Workspace';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';

export class WorkspaceRepository extends BaseRepository<Workspace> {
  private dbToUse: DatabaseFacade;

  constructor(@Inject(TOKENS.Database) db: DatabaseFacade) {
    super(db, 'workspaces');
    this.dbToUse = db;
  }

  // Returns a copy bound to `db` (e.g. a transaction client). The shared
  // instance is never modified: repositories are singletons, and rebinding
  // them left every later request on a released client ("Client was closed").
  withDb(db: DatabaseFacade): WorkspaceRepository {
    const bound = Object.create(Object.getPrototypeOf(this)) as WorkspaceRepository;
    Object.assign(bound, this);
    bound.dbToUse = db;
    return bound;
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
        description: row.description,
        logo: row.logo,
        website: row.website,
        industry: row.industry,
        size: row.size,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      },
      row.id,
    );
  }
}
