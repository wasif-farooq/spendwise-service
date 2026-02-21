import { BaseRepository } from '@shared/repositories/BaseRepository';
import { UserPreference } from '../models/UserPreference';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';

export class UserPreferencesRepository extends BaseRepository<UserPreference> {
    constructor(@Inject(TOKENS.Database) db: DatabaseFacade) {
        super(db, 'user_preferences');
    }

    protected mapToEntity(row: any): UserPreference {
        return UserPreference.restore({
            userId: row.user_id,
            theme: row.theme,
            language: row.language,
            timezone: row.timezone,
            color: row.color,
            notifications: row.notifications,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }, row.id);
    }

    async findByUserId(userId: string): Promise<UserPreference | null> {
        const result = await this.db.query(
            `SELECT * FROM ${this.tableName} WHERE user_id = $1 LIMIT 1`,
            [userId]
        );
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    async save(entity: UserPreference): Promise<void> {
        // Upsert logic
        const exists = await this.findByUserId(entity.userId);

        if (exists) {
            // Update
            await this.db.query(
                `UPDATE ${this.tableName} SET 
                    theme = $1, 
                    language = $2, 
                    timezone = $3, 
                    color = $4, 
                    notifications = $5, 
                    updated_at = NOW() 
                WHERE user_id = $6`,
                [
                    entity.theme,
                    entity.language,
                    entity.timezone,
                    entity.color,
                    JSON.stringify(entity.notifications),
                    entity.userId
                ]
            );
        } else {
            // Insert
            await this.db.query(
                `INSERT INTO ${this.tableName} 
                (id, user_id, theme, language, timezone, color, notifications, created_at, updated_at) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
                [
                    entity.id,
                    entity.userId,
                    entity.theme,
                    entity.language,
                    entity.timezone,
                    entity.color,
                    JSON.stringify(entity.notifications)
                ]
            );
        }
    }
}
