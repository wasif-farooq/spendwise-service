import { DatabaseFacade } from '@facades/DatabaseFacade';
import { PushToken, RegisterPushTokenInput } from '../models/PushToken';

const mapRow = (row: any): PushToken => ({
  id: row.id,
  userId: row.user_id,
  token: row.token,
  platform: row.platform,
  deviceName: row.device_name ?? null,
  appVersion: row.app_version ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastSeenAt: row.last_seen_at,
});

export class PushTokenRepository {
  constructor(private db: DatabaseFacade) {}

  /**
   * Insert the token, or refresh it if it exists. A token belongs to one install, so a
   * re-registration (for example after another user signs in on the same device) moves
   * it to the current user.
   */
  async upsert(userId: string, input: RegisterPushTokenInput): Promise<PushToken> {
    const result = await this.db.query(
      `INSERT INTO push_tokens (user_id, token, platform, device_name, app_version)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (token) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                platform = EXCLUDED.platform,
                device_name = EXCLUDED.device_name,
                app_version = EXCLUDED.app_version,
                updated_at = NOW(),
                last_seen_at = NOW()
            RETURNING *`,
      [userId, input.token, input.platform, input.deviceName ?? null, input.appVersion ?? null],
    );
    return mapRow(result.rows[0]);
  }

  /** Delete the token only if it belongs to this user. Returns whether a row was removed. */
  async deleteForUser(userId: string, token: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM push_tokens WHERE token = $1 AND user_id = $2',
      [token, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findByUser(userId: string): Promise<PushToken[]> {
    const result = await this.db.query(
      'SELECT * FROM push_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC',
      [userId],
    );
    return result.rows.map(mapRow);
  }
}
