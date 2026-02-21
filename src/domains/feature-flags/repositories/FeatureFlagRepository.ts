import { BaseRepository } from '@shared/repositories/BaseRepository';
import { FeatureFlag } from '../models/FeatureFlag';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';

export class FeatureFlagRepository extends BaseRepository<FeatureFlag> {
    constructor(@Inject(TOKENS.Database) db: DatabaseFacade) {
        super(db, 'feature_flags');
    }

    protected mapToEntity(row: any): FeatureFlag {
        return FeatureFlag.reconstitute({
            id: row.id,
            key: row.key,
            description: row.description,
            isEnabled: row.is_enabled,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        });
    }

    async findByKey(key: string): Promise<FeatureFlag | null> {
        const result = await this.db.query(`SELECT * FROM ${this.tableName} WHERE key = $1`, [key]);
        if (result.rows.length === 0) return null;
        return this.mapToEntity(result.rows[0]);
    }

    async findAll(): Promise<FeatureFlag[]> {
        const result = await this.db.query(`SELECT * FROM ${this.tableName}`);
        return result.rows.map((row: any) => this.mapToEntity(row));
    }
}
