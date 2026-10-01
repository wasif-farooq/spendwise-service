import { DatabaseFacade } from '@facades/DatabaseFacade';
import type { LinkRow, NewLink } from './types';

const mapRow = (row: any): LinkRow => ({
  id: row.id,
  connectionId: row.connection_id,
  accountId: row.account_id,
  assetKey: row.asset_key,
  chainId: row.chain_id ?? null,
  currencyCode: row.currency_code,
  syncMode: row.sync_mode,
  syncFrom: row.sync_from ?? null,
  cursor: row.cursor ?? null,
  lastProviderBalance: row.last_provider_balance ?? null,
  lastSyncedAt: row.last_synced_at ?? null,
  createdAt: row.created_at,
  accountName: row.account_name ?? undefined,
  importedCount: row.imported_count === undefined ? undefined : Number(row.imported_count),
});

export class ConnectionAccountRepository {
  constructor(private readonly db: DatabaseFacade) {}

  withDb(db: DatabaseFacade): ConnectionAccountRepository {
    return new ConnectionAccountRepository(db);
  }

  /** Throws the pg unique violation (23505) when the account or the asset is already linked. */
  async create(data: NewLink): Promise<LinkRow> {
    const result = await this.db.query(
      `INSERT INTO connection_accounts
         (connection_id, account_id, asset_key, chain_id, currency_code, sync_mode, sync_from)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.connectionId,
        data.accountId,
        data.assetKey,
        data.chainId,
        data.currencyCode,
        data.syncMode,
        data.syncFrom,
      ],
    );
    return mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<LinkRow | null> {
    const result = await this.db.query('SELECT * FROM connection_accounts WHERE id = $1', [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /** The link, row-locked for the rest of the caller's (short) write transaction. */
  async findByIdForUpdate(id: string): Promise<LinkRow | null> {
    const result = await this.db.query(
      'SELECT * FROM connection_accounts WHERE id = $1 FOR UPDATE',
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findByConnection(connectionId: string): Promise<LinkRow[]> {
    const result = await this.db.query(
      `SELECT l.*, a.name AS account_name,
              (SELECT COUNT(*) FROM transactions t WHERE t.connection_account_id = l.id) AS imported_count
         FROM connection_accounts l
         JOIN accounts a ON a.id = l.account_id
        WHERE l.connection_id = $1
        ORDER BY l.created_at ASC`,
      [connectionId],
    );
    return result.rows.map(mapRow);
  }

  async findByConnections(connectionIds: string[]): Promise<LinkRow[]> {
    if (connectionIds.length === 0) return [];
    const result = await this.db.query(
      `SELECT l.*, a.name AS account_name,
              (SELECT COUNT(*) FROM transactions t WHERE t.connection_account_id = l.id) AS imported_count
         FROM connection_accounts l
         JOIN accounts a ON a.id = l.account_id
        WHERE l.connection_id = ANY($1::uuid[])
        ORDER BY l.created_at ASC`,
      [connectionIds],
    );
    return result.rows.map(mapRow);
  }

  /** Account ids in the workspace that are already linked to some connection. */
  async linkedAccountIds(workspaceId: string): Promise<Set<string>> {
    const result = await this.db.query(
      `SELECT l.account_id FROM connection_accounts l
         JOIN connections c ON c.id = l.connection_id
        WHERE c.workspace_id = $1`,
      [workspaceId],
    );
    return new Set(result.rows.map((row: any) => row.account_id));
  }

  async saveSyncState(
    id: string,
    state: { cursor: unknown; lastProviderBalance: string | null },
  ): Promise<void> {
    await this.db.query(
      `UPDATE connection_accounts
          SET cursor = $2, last_provider_balance = $3, last_synced_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [
        id,
        state.cursor === undefined ? null : JSON.stringify(state.cursor),
        state.lastProviderBalance,
      ],
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM connection_accounts WHERE id = $1', [id]);
  }
}
