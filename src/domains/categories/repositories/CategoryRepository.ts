import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Category, CategoryProps } from '../models/Category';

export class CategoryRepository {
    private dbToUse: DatabaseFacade;

    constructor(db: DatabaseFacade) { 
        this.dbToUse = db;
    }

    // For using a different DB client (e.g., in transactions)
    withDb(db: DatabaseFacade): CategoryRepository {
        this.dbToUse = db;
        return this;
    }

    async findAll(workspaceId: string): Promise<Category[]> {
        const result = await this.dbToUse.query(
            'SELECT * FROM categories WHERE workspace_id = $1 ORDER BY name',
            [workspaceId]
        );
        
        return result.rows.map((row: any) => new Category({
            id: row.id,
            name: row.name,
            type: row.type,
            icon: row.icon,
            color: row.color,
            description: row.description,
            workspaceId: row.workspace_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }

    async findById(id: string, workspaceId: string): Promise<Category | null> {
        const result = await this.dbToUse.query(
            'SELECT * FROM categories WHERE id = $1 AND workspace_id = $2',
            [id, workspaceId]
        );
        
        if (result.rows.length === 0) return null;
        
        const row: any = result.rows[0];
        return new Category({
            id: row.id,
            name: row.name,
            type: row.type,
            icon: row.icon,
            color: row.color,
            description: row.description,
            workspaceId: row.workspace_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        });
    }

    async findByType(type: 'income' | 'expense', workspaceId: string): Promise<Category[]> {
        const result = await this.dbToUse.query(
            'SELECT * FROM categories WHERE (type = $1 OR type = $all) AND workspace_id = $2 ORDER BY name',
            [type, workspaceId]
        );
        
        return result.rows.map((row: any) => new Category({
            id: row.id,
            name: row.name,
            type: row.type,
            icon: row.icon,
            color: row.color,
            workspaceId: row.workspace_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }

    async create(category: CategoryProps): Promise<Category> {
        const result = await this.dbToUse.query(
            `INSERT INTO categories (id, name, type, icon, color, description, workspace_id, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
             RETURNING *`,
            [category.name, category.type, category.icon, category.color, category.description || null, category.workspaceId]
        );
        
        const row = result.rows[0];
        return new Category({
            id: row.id,
            name: row.name,
            type: row.type,
            icon: row.icon,
            color: row.color,
            description: row.description,
            workspaceId: row.workspace_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        });
    }

    async update(id: string, workspaceId: string, data: Partial<CategoryProps>): Promise<Category | null> {
        const fields: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (data.name) {
            fields.push(`name = $${paramIndex++}`);
            values.push(data.name);
        }
        if (data.type) {
            fields.push(`type = $${paramIndex++}`);
            values.push(data.type);
        }
        if (data.icon !== undefined) {
            fields.push(`icon = $${paramIndex++}`);
            values.push(data.icon);
        }
        if (data.color !== undefined) {
            fields.push(`color = $${paramIndex++}`);
            values.push(data.color);
        }
        if (data.description !== undefined) {
            fields.push(`description = $${paramIndex++}`);
            values.push(data.description);
        }

        if (fields.length === 0) return null;

        fields.push('updated_at = NOW()');
        values.push(id, workspaceId);

        const result = await this.dbToUse.query(
            `UPDATE categories SET ${fields.join(', ')} WHERE id = $${paramIndex++} AND workspace_id = $${paramIndex} RETURNING *`,
            values
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return new Category({
            id: row.id,
            name: row.name,
            type: row.type,
            icon: row.icon,
            color: row.color,
            workspaceId: row.workspace_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        });
    }

    async delete(id: string, workspaceId: string): Promise<boolean> {
        const result = await this.dbToUse.query(
            'DELETE FROM categories WHERE id = $1 AND workspace_id = $2',
            [id, workspaceId]
        );
        return (result.rowCount || 0) > 0;
    }

    async deleteByWorkspaceId(workspaceId: string): Promise<void> {
        await this.dbToUse.query('DELETE FROM categories WHERE workspace_id = $1', [workspaceId]);
    }
}
