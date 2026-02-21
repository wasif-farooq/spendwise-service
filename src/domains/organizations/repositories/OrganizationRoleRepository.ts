import { BaseRepository } from '@shared/repositories/BaseRepository';
import { OrganizationRole } from '../models/OrganizationRole';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';

export class OrganizationRoleRepository extends BaseRepository<OrganizationRole> {
    constructor(@Inject(TOKENS.Database) db: DatabaseFacade) {
        super(db, 'organization_roles');
    }
    async findByNameAndOrg(name: string, organizationId: string): Promise<OrganizationRole | null> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE name = $1 AND organization_id = $2 LIMIT 1`,
            [name, organizationId]
        );
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    async findByIds(ids: string[]): Promise<OrganizationRole[]> {
        if (ids.length === 0) return [];
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE id = ANY($1)`,
            [ids]
        );
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    async findByOrg(organizationId: string): Promise<OrganizationRole[]> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE organization_id = $1`,
            [organizationId]
        );
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    async findPaginated(organizationId: string, options: { limit: number; offset: number; search?: string }): Promise<{ roles: OrganizationRole[]; total: number }> {
        let query = `SELECT * FROM ${this.tableName} WHERE organization_id = $1`;
        let countQuery = `SELECT COUNT(*) FROM ${this.tableName} WHERE organization_id = $1`;
        const params: any[] = [organizationId];

        if (options.search) {
            query += ` AND (name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1})`;
            countQuery += ` AND (name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1})`;
            params.push(`%${options.search}%`);
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

    protected mapToEntity(row: any): OrganizationRole {
        return OrganizationRole.restore(
            {
                name: row.name,
                description: row.description,
                organizationId: row.organization_id,
                permissions: row.permissions,
                isSystem: row.is_system,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at),
            },
            row.id
        );
    }
}

