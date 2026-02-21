import { DatabaseFacade } from '@facades/DatabaseFacade';
// import { IReadRepository } from '@shared/contracts/IReadRepository';
// Assuming Repository pattern implementation details

export abstract class BaseRepository<T> {
    constructor(protected db: DatabaseFacade, protected tableName: string) { }

    private toSnakeCase(str: string): string {
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    }

    protected mapToDb(data: any): any {
        const mapped: any = {};
        for (const [key, value] of Object.entries(data)) {
            if (key === '_id') continue;
            mapped[this.toSnakeCase(key)] = value;
        }
        return mapped;
    }

    private getData(input: any): any {
        let data: any;
        if (typeof input.getProps === 'function') {
            data = input.getProps();
        } else {
            data = input.props ? { ...input.props } : { ...input };
        }

        // Ensure ID is matched
        if (input.id && !data.id) {
            data.id = input.id;
        }

        return data;
    }

    async findAll(options?: { db?: DatabaseFacade }): Promise<T[]> {
        const db = options?.db || this.db;
        const result = await db.query(`SELECT * FROM ${this.tableName}`);
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    async findById(id: string, options?: { db?: DatabaseFacade }): Promise<T | null> {
        const db = options?.db || this.db;
        const result = await db.query(`SELECT * FROM ${this.tableName} WHERE id = $1`, [id]);
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    protected mapToEntity(row: any): T {
        return row as T;
    }

    async create(input: any, options?: { db?: DatabaseFacade }): Promise<T> {
        const db = options?.db || this.db;
        const data = this.getData(input);
        const mappedData = this.mapToDb(data);
        const keys = Object.keys(mappedData);
        const values = Object.values(mappedData);
        const indices = keys.map((_, i) => `$${i + 1}`).join(', ');
        const query = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${indices}) RETURNING *`;

        const result = await db.query(query, values);
        return result.rows[0];
    }

    async update(id: string, input: any, options?: { db?: DatabaseFacade }): Promise<T> {
        const db = options?.db || this.db;
        const data = this.getData(input);
        const mappedData = this.mapToDb(data);
        const keys = Object.keys(mappedData).filter(k => k !== 'id' && k !== 'updated_at');
        const values = keys.map(k => mappedData[k]);
        const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
        const query = `UPDATE ${this.tableName} SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`;

        const result = await db.query(query, [id, ...values]);
        if (result.rowCount === 0) throw new Error('Entity not found');
        return result.rows[0];
    }

    async save(entity: any, options?: { db?: DatabaseFacade }): Promise<void> {
        const db = options?.db || this.db;
        const data = this.getData(entity);
        const id = entity.id || data.id;

        // Check if exists
        const existing = await this.findById(id, { db });
        if (existing) {
            await this.update(id, data, { db });
        } else {
            await this.create(data, { db });
        }
    }

    async delete(id: string, options?: { db?: DatabaseFacade }): Promise<boolean> {
        const db = options?.db || this.db;
        const result = await db.query(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);
        return (result.rowCount ?? 0) > 0;
    }
}


