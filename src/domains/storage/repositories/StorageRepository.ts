import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Attachment } from '../models/Attachment';
import { IStorageRepository } from './IStorageRepository';

export class StorageRepository implements IStorageRepository {
    private tableName = 'attachments';

    constructor(private db: DatabaseFacade) {}

    private toSnakeCase(str: string): string {
        return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    }

    private mapToEntity(row: any): Attachment {
        return row as Attachment;
    }

    async create(attachment: Partial<Attachment>): Promise<Attachment> {
        // Only include workspace_id if it's provided and valid
        // For user-specific uploads (avatars, etc.), we can omit workspace_id
        const data: Record<string, any> = {
            user_id: attachment.userId,
            bucket: attachment.bucket,
            key: attachment.key,
            filename: attachment.filename,
            content_type: attachment.contentType,
            size: attachment.size,
            metadata: JSON.stringify(attachment.metadata || {}),
        };
        
        // Only add workspace_id if it's a valid UUID (not empty/undefined)
        if (attachment.workspaceId && attachment.workspaceId.length === 36) {
            data.workspace_id = attachment.workspaceId;
        }

        const keys = Object.keys(data);
        const values = Object.values(data);
        const indices = keys.map((_, i) => `$${i + 1}`).join(', ');
        const query = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${indices}) RETURNING *`;

        const result = await this.db.query(query, values);
        return this.mapToEntity(result.rows[0]);
    }

    async findById(id: string): Promise<Attachment | null> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE id = $1`,
            [id]
        );
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    async findByWorkspace(workspaceId: string, limit = 50, offset = 0): Promise<Attachment[]> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
            [workspaceId, limit, offset]
        );
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    async findByUser(userId: string): Promise<Attachment[]> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId]
        );
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    async findByBucketAndKey(bucket: string, key: string): Promise<Attachment | null> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE bucket = $1 AND key = $2`,
            [bucket, key]
        );
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    async delete(id: string): Promise<void> {
        await this.db.query(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);
    }

    async update(id: string, data: Partial<Attachment>): Promise<Attachment> {
        const updateFields: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (data.filename !== undefined) {
            updateFields.push(`filename = $${paramIndex++}`);
            values.push(data.filename);
        }
        if (data.metadata !== undefined) {
            updateFields.push(`metadata = $${paramIndex++}`);
            values.push(JSON.stringify(data.metadata));
        }

        if (updateFields.length === 0) {
            return (await this.findById(id))!;
        }

        updateFields.push(`updated_at = NOW()`);
        values.push(id);

        const query = `UPDATE ${this.tableName} SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
        const result = await this.db.query(query, values);
        return this.mapToEntity(result.rows[0]);
    }

    async countByWorkspace(workspaceId: string): Promise<number> {
        const result = await this.db.query(
            `SELECT COUNT(*) as count FROM ${this.tableName} WHERE workspace_id = $1`,
            [workspaceId]
        );
        return parseInt(result.rows[0].count);
    }
}
