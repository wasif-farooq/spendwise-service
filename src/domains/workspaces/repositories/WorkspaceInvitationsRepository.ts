import { BaseRepository } from '@shared/repositories/BaseRepository';
import { WorkspaceInvitation } from '../models/WorkspaceInvitation';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';

export class WorkspaceInvitationsRepository extends BaseRepository<WorkspaceInvitation> {
    private dbToUse: DatabaseFacade;

    constructor(@Inject(TOKENS.Database) db: DatabaseFacade) {
        super(db, 'workspace_invitations');
        this.dbToUse = db;
    }

    withDb(db: DatabaseFacade): WorkspaceInvitationsRepository {
        this.dbToUse = db;
        return this;
    }

    protected mapToEntity(row: any): WorkspaceInvitation {
        return WorkspaceInvitation.restore({
            workspaceId: row.workspace_id,
            email: row.email,
            roleIds: row.role_ids || [],
            accountPermissions: row.account_permissions,
            token: row.token,
            status: row.status,
            expiresAt: row.expires_at,
            invitedBy: row.invited_by,
            acceptedBy: row.accepted_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }, row.id);
    }

    async findById(id: string): Promise<WorkspaceInvitation | null> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
            [id]
        );
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    async findByToken(token: string): Promise<WorkspaceInvitation | null> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE token = $1 LIMIT 1`,
            [token]
        );
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    async findByEmail(email: string): Promise<WorkspaceInvitation[]> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE email = $1 AND status = 'pending'`,
            [email.toLowerCase()]
        );
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    async findByWorkspaceAndEmail(workspaceId: string, email: string, status?: string): Promise<WorkspaceInvitation | null> {
        let query = `SELECT * FROM ${this.tableName} WHERE workspace_id = $1 AND email = $2`;
        const params: any[] = [workspaceId, email.toLowerCase()];
        
        if (status) {
            query += ` AND status = $3`;
            params.push(status);
        }
        
        query += ` LIMIT 1`;
        const result = await this.db.query(query, params);
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    async findByWorkspaceId(workspaceId: string, options: {
        limit?: number;
        offset?: number;
        status?: string;
    } = {}): Promise<{ invitations: any[]; total: number }> {
        const { limit = 10, offset = 0, status } = options;

        let whereClause = 'WHERE wi.workspace_id = $1';
        const params: any[] = [workspaceId];
        let paramIndex = 2;

        if (status) {
            whereClause += ` AND wi.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        const countQuery = `
            SELECT COUNT(*) as total 
            FROM ${this.tableName} wi
            ${whereClause}
        `;
        const countResult = await this.db.query(countQuery, params);
        const total = parseInt(countResult.rows[0]?.total || '0');

        const query = `
            SELECT 
                wi.id,
                wi.workspace_id,
                wi.email,
                wi.role_ids,
                wi.account_permissions,
                wi.token,
                wi.status,
                wi.expires_at,
                wi.invited_by,
                wi.accepted_by,
                wi.created_at,
                wi.updated_at,
                u.first_name as inviter_first_name,
                u.last_name as inviter_last_name
            FROM ${this.tableName} wi
            LEFT JOIN users u ON wi.invited_by = u.id
            ${whereClause}
            ORDER BY wi.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const finalParams = [...params, limit, offset];
        const result = await this.db.query(query, finalParams);

        const invitations = result.rows.map((row: any) => ({
            id: row.id,
            workspaceId: row.workspace_id,
            email: row.email,
            roleIds: row.role_ids,
            accountPermissions: row.account_permissions,
            token: row.token,
            status: row.status,
            expiresAt: row.expires_at,
            invitedBy: row.invited_by,
            acceptedBy: row.accepted_by,
            createdAt: row.created_at,
            inviterName: row.inviter_first_name && row.inviter_last_name 
                ? `${row.inviter_first_name} ${row.inviter_last_name}` 
                : null
        }));

        return { invitations, total };
    }

    async create(invitation: WorkspaceInvitation): Promise<WorkspaceInvitation> {
        const result = await this.dbToUse.query(
            `INSERT INTO ${this.tableName} 
             (workspace_id, email, role_ids, account_permissions, token, status, expires_at, invited_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [
                invitation.workspaceId,
                invitation.email.toLowerCase(),
                invitation.roleIds,
                JSON.stringify(invitation.accountPermissions || {}),
                invitation.token,
                invitation.status,
                invitation.expiresAt,
                invitation.invitedBy,
                invitation.createdAt,
                invitation.updatedAt
            ]
        );
        return this.mapToEntity(result.rows[0]);
    }

    async updateInvitation(invitation: WorkspaceInvitation): Promise<WorkspaceInvitation> {
        const result = await this.dbToUse.query(
            `UPDATE ${this.tableName} 
             SET email = $2, role_ids = $3, account_permissions = $4, token = $5, status = $6, 
                 expires_at = $7, accepted_by = $8, updated_at = $9
             WHERE id = $1
             RETURNING *`,
            [
                invitation.id,
                invitation.email.toLowerCase(),
                invitation.roleIds,
                JSON.stringify(invitation.accountPermissions || {}),
                invitation.token,
                invitation.status,
                invitation.expiresAt,
                invitation.acceptedBy,
                new Date()
            ]
        );
        return this.mapToEntity(result.rows[0]);
    }

    async deleteInvitation(id: string): Promise<boolean> {
        await this.dbToUse.query(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);
        return true;
    }

    async deleteByWorkspaceId(workspaceId: string): Promise<void> {
        await this.dbToUse.query(`DELETE FROM ${this.tableName} WHERE workspace_id = $1`, [workspaceId]);
    }
}