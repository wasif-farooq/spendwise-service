import { DatabaseFacade } from '@facades/DatabaseFacade';
import type { ConnectionErrorCode } from '../providers/errors';
import type { ConnectionRow, NewConnection, OwnerLimits } from './types';

const mapRow = (row: any): ConnectionRow => ({
  id: row.id,
  workspaceId: row.workspace_id,
  createdBy: row.created_by ?? null,
  provider: row.provider,
  kind: row.kind,
  displayName: row.display_name,
  externalRef: row.external_ref,
  credentialsEnc: row.credentials_enc ?? null,
  metadata: row.metadata ?? {},
  status: row.status,
  syncStartedAt: row.sync_started_at ?? null,
  lastSyncedAt: row.last_synced_at ?? null,
  nextSyncAt: row.next_sync_at ?? null,
  lastError: row.last_error ?? null,
  lastErrorCode: row.last_error_code ?? null,
  consecutiveFailures: Number(row.consecutive_failures ?? 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class ConnectionRepository {
  constructor(private readonly db: DatabaseFacade) {}

  withDb(db: DatabaseFacade): ConnectionRepository {
    return new ConnectionRepository(db);
  }

  /** Throws the pg unique violation (23505) when the wallet is already connected. */
  async create(data: NewConnection): Promise<ConnectionRow> {
    const result = await this.db.query(
      `INSERT INTO connections
         (workspace_id, created_by, provider, kind, display_name, external_ref,
          credentials_enc, metadata, status, next_sync_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW())
       RETURNING *`,
      [
        data.workspaceId,
        data.createdBy,
        data.provider,
        data.kind,
        data.displayName,
        data.externalRef,
        data.credentialsEnc,
        JSON.stringify(data.metadata ?? {}),
      ],
    );
    return mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<ConnectionRow | null> {
    const result = await this.db.query('SELECT * FROM connections WHERE id = $1', [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findInWorkspace(id: string, workspaceId: string): Promise<ConnectionRow | null> {
    const result = await this.db.query(
      'SELECT * FROM connections WHERE id = $1 AND workspace_id = $2',
      [id, workspaceId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<ConnectionRow[]> {
    const result = await this.db.query(
      'SELECT * FROM connections WHERE workspace_id = $1 ORDER BY created_at ASC',
      [workspaceId],
    );
    return result.rows.map(mapRow);
  }

  /** Wallet connections across every workspace the owner owns (the plan is the owner's). */
  async countWalletsForOwner(ownerId: string): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(*)::int AS count
         FROM connections c
         JOIN workspaces w ON w.id = c.workspace_id
        WHERE w.owner_id = $1 AND c.kind = 'crypto_wallet' AND c.status <> 'disconnected'`,
      [ownerId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async findOwnerLimits(workspaceId: string): Promise<OwnerLimits | null> {
    const result = await this.db.query(
      `SELECT w.owner_id,
              sp.name AS plan_name,
              COALESCE(sp.limits, '{}'::jsonb) || COALESCE(us.limits_snapshot, '{}'::jsonb) AS limits
         FROM workspaces w
         LEFT JOIN LATERAL (
              SELECT * FROM user_subscriptions
               WHERE user_id = w.owner_id
               ORDER BY created_at DESC
               LIMIT 1
         ) us ON TRUE
         LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
        WHERE w.id = $1`,
      [workspaceId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { ownerId: row.owner_id, planName: row.plan_name ?? null, limits: row.limits ?? {} };
  }

  /**
   * Claims the connection for one sync run: status 'syncing' + sync_started_at, in one
   * atomic UPDATE. Returns the claim token (sync_started_at as text, full precision), or
   * null when another run holds a claim younger than `staleMinutes` (a crashed run's
   * claim is taken over once it's older). No lock or connection is held in between.
   */
  async claimSync(id: string, staleMinutes: number): Promise<string | null> {
    const result = await this.db.query(
      `UPDATE connections
          SET status = 'syncing', sync_started_at = NOW(), updated_at = NOW()
        WHERE id = $1
          AND status <> 'disconnected'
          AND (status <> 'syncing'
               OR sync_started_at IS NULL
               OR sync_started_at < NOW() - make_interval(mins => $2::int))
        RETURNING sync_started_at::text AS claim`,
      [id, staleMinutes],
    );
    return result.rows[0]?.claim ?? null;
  }

  /** Releases a claim after success. A no-op when the claim was taken over meanwhile. */
  async markSynced(id: string, nextSyncAt: Date, claim: string): Promise<void> {
    await this.db.query(
      `UPDATE connections
          SET status = 'active', sync_started_at = NULL, last_synced_at = NOW(), next_sync_at = $2,
              last_error = NULL, last_error_code = NULL, consecutive_failures = 0,
              updated_at = NOW()
        WHERE id = $1 AND sync_started_at = $3::timestamptz`,
      [id, nextSyncAt, claim],
    );
  }

  /** Releases a claim after a failure, storing the error and the backoff. */
  async markFailed(
    id: string,
    code: ConnectionErrorCode,
    message: string,
    nextSyncAt: Date,
    claim: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE connections
          SET status = CASE WHEN $2 = 'REAUTH_REQUIRED' THEN 'reauth_required' ELSE 'error' END,
              sync_started_at = NULL,
              last_error = $3, last_error_code = $2, next_sync_at = $4,
              consecutive_failures = consecutive_failures + 1, updated_at = NOW()
        WHERE id = $1 AND sync_started_at = $5::timestamptz`,
      [id, code, message.slice(0, 500), nextSyncAt, claim],
    );
  }

  /** Last resort (markSynced/markFailed didn't run): drop the claim, keep the last outcome. */
  async releaseClaim(id: string, claim: string): Promise<void> {
    await this.db.query(
      `UPDATE connections
          SET status = CASE WHEN last_error_code IS NULL THEN 'active' ELSE 'error' END,
              sync_started_at = NULL, updated_at = NOW()
        WHERE id = $1 AND sync_started_at = $2::timestamptz`,
      [id, claim],
    );
  }

  /** Due for a scheduled sync, oldest first. */
  async findDue(limit: number, now: Date = new Date()): Promise<ConnectionRow[]> {
    const result = await this.db.query(
      `SELECT * FROM connections
        WHERE status NOT IN ('disconnected', 'reauth_required')
          AND (next_sync_at IS NULL OR next_sync_at <= $1)
          AND EXISTS (SELECT 1 FROM connection_accounts l WHERE l.connection_id = connections.id)
        ORDER BY next_sync_at ASC NULLS FIRST
        LIMIT $2`,
      [now, limit],
    );
    return result.rows.map(mapRow);
  }

  async setNextSync(id: string, nextSyncAt: Date): Promise<void> {
    await this.db.query(
      'UPDATE connections SET next_sync_at = $2, updated_at = NOW() WHERE id = $1',
      [id, nextSyncAt],
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM connections WHERE id = $1', [id]);
  }

  /** For key rotation: every row holding encrypted data. */
  async listEncrypted(): Promise<Array<{ id: string; credentialsEnc: Buffer }>> {
    const result = await this.db.query(
      'SELECT id, credentials_enc FROM connections WHERE credentials_enc IS NOT NULL',
    );
    return result.rows.map((row: any) => ({ id: row.id, credentialsEnc: row.credentials_enc }));
  }

  async updateCredentials(id: string, credentialsEnc: Buffer): Promise<void> {
    await this.db.query(
      'UPDATE connections SET credentials_enc = $2, updated_at = NOW() WHERE id = $1',
      [id, credentialsEnc],
    );
  }
}
