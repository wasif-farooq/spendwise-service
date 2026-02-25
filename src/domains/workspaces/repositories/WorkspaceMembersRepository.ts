import { BaseRepository } from '@shared/repositories/BaseRepository';
import { WorkspaceMember } from '../models/WorkspaceMember';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';

export class WorkspaceMembersRepository extends BaseRepository<WorkspaceMember> {
    constructor(@Inject(TOKENS.Database) db: DatabaseFacade) {
        super(db, 'workspace_members');
    }

    protected mapToEntity(row: any): WorkspaceMember {
        return WorkspaceMember.restore({
            userId: row.user_id,
            workspaceId: row.workspace_id,
            roleIds: row.role_ids || [],
            joinedAt: row.joined_at
        }, row.id);
    }

    async findByUserAndWorkspace(userId: string, workspaceId: string): Promise<WorkspaceMember | null> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE user_id = $1 AND workspace_id = $2 LIMIT 1`,
            [userId, workspaceId]
        );
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    async findByUserId(userId: string): Promise<WorkspaceMember[]> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE user_id = $1`,
            [userId]
        );
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    async findByWorkspaceId(workspaceId: string): Promise<WorkspaceMember[]> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE workspace_id = $1`,
            [workspaceId]
        );
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    async countByRole(roleId: string): Promise<number> {
        const result = await this.db.query(
            `SELECT COUNT(*) as count FROM ${this.tableName} WHERE $1 = ANY(role_ids)`,
            [roleId]
        );
        return result.rows[0] ? Number(result.rows[0].count) : 0;
    }

    async findAllWithDetails(workspaceId: string): Promise<any[]> {
        const query = `
            SELECT 
                wm.id as member_id,
                wm.user_id,
                wm.workspace_id,
                wm.joined_at,
                wm.role_ids,
                u.first_name,
                u.last_name,
                u.email
            FROM ${this.tableName} wm
            JOIN users u ON wm.user_id = u.id
            WHERE wm.workspace_id = $1
        `;
        const result = await this.db.query(query, [workspaceId]);

        // Fetch role names for all members (can be optimized with aggregation in query if needed)
        // For simplicity and speed in this context, we will map them.
        return result.rows.map((row: any) => ({
            id: row.member_id,
            userId: row.user_id,
            workspaceId: row.workspace_id,
            roleIds: row.role_ids,
            firstName: row.first_name,
            lastName: row.last_name,
            email: row.email,
            joinedAt: row.joined_at
        }));
    }
}
