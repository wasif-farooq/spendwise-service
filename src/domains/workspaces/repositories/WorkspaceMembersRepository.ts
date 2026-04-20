import { BaseRepository } from '@shared/repositories/BaseRepository';
import { WorkspaceMember } from '../models/WorkspaceMember';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';

export class WorkspaceMembersRepository extends BaseRepository<WorkspaceMember> {
    private dbToUse: DatabaseFacade;

    constructor(@Inject(TOKENS.Database) db: DatabaseFacade) {
        super(db, 'workspace_members');
        this.dbToUse = db;
    }

    // For using a different DB client (e.g., in transactions)
    withDb(db: DatabaseFacade): WorkspaceMembersRepository {
        this.dbToUse = db;
        return this;
    }

    protected mapToEntity(row: any): WorkspaceMember {
        return WorkspaceMember.restore({
            userId: row.user_id,
            workspaceId: row.workspace_id,
            roleIds: row.role_ids || [],
            joinedAt: row.joined_at,
            status: row.status || 'active'
        }, row.id);
    }

    async findByUserAndWorkspace(userId: string, workspaceId: string): Promise<WorkspaceMember | null> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE user_id = $1 AND workspace_id = $2 LIMIT 1`,
            [userId, workspaceId]
        );
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    async findById(id: string): Promise<WorkspaceMember | null> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
            [id]
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

    async findAllWithDetails(workspaceId: string, options: { 
        limit?: number; 
        offset?: number; 
        search?: string;
        roles?: string[];
        statuses?: string[];
        startDate?: string;
        endDate?: string;
        memberId?: string;
    } = {}): Promise<{ members: any[]; total: number }> {
        
        const { limit = 10, offset = 0, search, roles, statuses, startDate, endDate, memberId } = options;

        let whereClause = 'WHERE wm.workspace_id = $1';
        const params: any[] = [workspaceId];
        let paramIndex = 2;

        // Member ID filter
        if (memberId) {
            whereClause += ` AND wm.id = $${paramIndex}`;
            params.push(memberId);
            paramIndex++;
        }

        // Search filter (name, email)
        if (search) {
            whereClause += ` AND (LOWER(u.first_name) LIKE $${paramIndex} OR LOWER(u.last_name) LIKE $${paramIndex} OR LOWER(u.email) LIKE $${paramIndex})`;
            params.push(`%${search.toLowerCase()}%`);
            paramIndex++;
        }

        // Role filter - need to join with workspace_roles to get role names
        // We'll handle this after getting results since role names need to be resolved

        // Start date filter
        if (startDate) {
            whereClause += ` AND wm.joined_at >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        // End date filter
        if (endDate) {
            whereClause += ` AND wm.joined_at <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM ${this.tableName} wm
            JOIN users u ON wm.user_id = u.id
            ${whereClause}
        `;
        const countResult = await this.db.query(countQuery, params);
        const total = parseInt(countResult.rows[0]?.total || '0');

        // Get paginated results
        const query = `
            SELECT 
                wm.id as member_id,
                wm.user_id,
                wm.workspace_id,
                wm.joined_at,
                wm.role_ids,
                wm.status,
                u.first_name,
                u.last_name,
                u.email,
                wr.name as role_name
            FROM ${this.tableName} wm
            JOIN users u ON wm.user_id = u.id
            LEFT JOIN workspace_roles wr ON wr.id::text = (wm.role_ids)[1]::text
            ${whereClause}
            ORDER BY wm.joined_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        
        const finalParams = [...params, limit, offset];
        const result = await this.db.query(query, finalParams);

        // Get all roles for the workspace to filter by role name
        let roleFilterApplied = false;
        let members = result.rows.map((row: any) => ({
            id: row.member_id,
            userId: row.user_id,
            workspaceId: row.workspace_id,
            roleIds: row.role_ids,
            role: row.role_name || 'Member',
            firstName: row.first_name,
            lastName: row.last_name,
            email: row.email,
            joinedAt: row.joined_at,
            status: row.status || 'active'
        }));

        // Apply role filter (after getting results since we need role names)
        if (roles && roles.length > 0) {
            members = members.filter((m: any) => roles.includes(m.role));
            roleFilterApplied = true;
        }

        // Apply status filter (placeholder - would need invitation table for proper implementation)
        if (statuses && statuses.length > 0) {
            members = members.filter((m: any) => statuses.includes(m.status));
        }

        return { members, total };
    }

    async deleteByWorkspaceId(workspaceId: string): Promise<void> {
        await this.dbToUse.query('DELETE FROM workspace_members WHERE workspace_id = $1', [workspaceId]);
    }

    // Account permissions methods
    async saveAccountPermissions(
        memberId: string, 
        accountPermissions: Record<string, { permissions: string[]; denied: string[] }>
    ): Promise<void> {
        for (const [accountId, perms] of Object.entries(accountPermissions)) {
            await this.db.query(
                `INSERT INTO workspace_member_account_permissions (member_id, account_id, permissions, denied_permissions, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, NOW(), NOW())
                 ON CONFLICT (member_id, account_id) 
                 DO UPDATE SET permissions = $3, denied_permissions = $4, updated_at = NOW()`,
                [memberId, accountId, perms.permissions, perms.denied]
            );
        }
    }

    async getAccountPermissions(memberId: string): Promise<Record<string, { permissions: string[]; denied: string[] }>> {
        const result = await this.db.query(
            `SELECT account_id, permissions, denied_permissions 
             FROM workspace_member_account_permissions 
             WHERE member_id = $1`,
            [memberId]
        );
        
        const permissions: Record<string, { permissions: string[]; denied: string[] }> = {};
        for (const row of result.rows) {
            permissions[row.account_id] = {
                permissions: row.permissions || [],
                denied: row.denied_permissions || []
            };
        }
        return permissions;
    }

    async deleteAccountPermissions(memberId: string): Promise<void> {
        await this.db.query(
            'DELETE FROM workspace_member_account_permissions WHERE member_id = $1',
            [memberId]
        );
    }
}
