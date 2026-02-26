import { BaseRepository } from '@shared/repositories/BaseRepository';
import { WorkspaceRole } from '../models/WorkspaceRole';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';

export class WorkspaceRoleRepository extends BaseRepository<WorkspaceRole> {
    constructor(@Inject(TOKENS.Database) db: DatabaseFacade) {
        super(db, 'workspace_roles');
    }
    async findByNameAndWorkspace(name: string, workspaceId: string): Promise<WorkspaceRole | null> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE name = $1 AND workspace_id = $2 LIMIT 1`,
            [name, workspaceId]
        );
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    async findByIds(ids: string[]): Promise<WorkspaceRole[]> {
        if (ids.length === 0) return [];
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE id = ANY($1)`,
            [ids]
        );
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    async findByWorkspace(workspaceId: string): Promise<WorkspaceRole[]> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE workspace_id = $1`,
            [workspaceId]
        );
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    async findPaginated(workspaceId: string, options: { 
        limit: number; 
        offset: number; 
        search?: string;
        types?: string[];
        minPermissions?: number;
    }): Promise<{ roles: WorkspaceRole[]; total: number }> {
        let query = `SELECT * FROM ${this.tableName} WHERE workspace_id = $1`;
        let countQuery = `SELECT COUNT(*) FROM ${this.tableName} WHERE workspace_id = $1`;
        const params: any[] = [workspaceId];

        // Search filter
        if (options.search) {
            query += ` AND (name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1})`;
            countQuery += ` AND (name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1})`;
            params.push(`%${options.search}%`);
        }

        // Types filter (System/Custom)
        if (options.types && options.types.length > 0) {
            const isSystemValues = options.types.map(t => t === 'System' ? 'true' : 'false');
            const typeCondition = isSystemValues.map((v, i) => `is_system = $${params.length + 1 + i}`).join(' OR ');
            query += ` AND (${typeCondition})`;
            countQuery += ` AND (${typeCondition})`;
            params.push(...isSystemValues);
        }

        // Min permissions filter
        if (options.minPermissions && options.minPermissions > 0) {
            // Cast text to jsonb for array_length function
            query += ` AND (SELECT jsonb_array_length(permissions::jsonb)) >= $${params.length + 1}`;
            countQuery += ` AND (SELECT jsonb_array_length(permissions::jsonb)) >= $${params.length + 1}`;
            params.push(options.minPermissions);
        }

        const totalResult = await this.db.query(countQuery, params);
        const total = parseInt(totalResult.rows[0].count);

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        const finalParams = [...params, options.limit, options.offset];
        const rolesResult = await this.db.query(query, finalParams);

        return {
            roles: rolesResult.rows.map((row: any) => this.mapToEntity(row)),
            total
        };
    }

    protected mapToEntity(row: any): WorkspaceRole {
        return WorkspaceRole.restore(
            {
                name: row.name,
                description: row.description,
                workspaceId: row.workspace_id,
                permissions: row.permissions,
                isSystem: row.is_system,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at),
            },
            row.id
        );
    }
}
