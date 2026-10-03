import { AppError } from '@shared/errors/AppError';
import type { DatabaseFacade } from '@facades/DatabaseFacade';
import { isCrypto } from '@domains/currencies/currencies';
import type {
  ImportedTransactionRow,
  TransactionRepository,
} from '@domains/transactions/repositories/TransactionRepository';
import type { SecretBox } from '@shared/crypto/secretBox';
import { absUnits, dustUnits, fromUnits, toUnits } from '../providers/decimal';
import { ConnectionErrorCode, ProviderError, errorCodeOf } from '../providers/errors';
import type { ProviderRegistry } from '../providers/ProviderRegistry';
import type { ConnectionProvider, NormalizedTxn, ProviderConnection } from '../providers/types';
import type { ConnectionAccountRepository } from '../repositories/ConnectionAccountRepository';
import type { ConnectionRepository } from '../repositories/ConnectionRepository';
import type { ConnectionRow, LinkRow } from '../repositories/types';

/**
 * Keeps linked accounts in step with their source.
 *
 * One run, for one connection:
 *  1. Claims the connection: one atomic UPDATE sets status 'syncing' and
 *     sync_started_at. Another live claim → 409 SYNC_IN_PROGRESS; a claim older
 *     than SYNC_CLAIM_STALE_MINUTES (a crashed run) is taken over. Nothing is held
 *     between statements, across the API, the worker and the CLI alike.
 *  2. Fetch phase, with no DB transaction open (OAuth sources first roll their
 *     tokens, see freshConnection): per link, pages from its stored
 *     cursor (at most 5 pages / 1,000 rows a run; a first import stops at 2,000)
 *     and the provider balance, kept in memory.
 *  3. Write phase: one short transaction per link: re-read the link under a row
 *     lock (a cursor moved by an overlapping run is never moved back), insert the
 *     rows (duplicates skipped), reconcile, save the cursor, recompute the balance.
 *  4. Releases the claim (markSynced / markFailed, guarded by the claim token),
 *     always, and clears the stats cache of the touched accounts.
 *  5. On failure stores an error code and pushes next_sync_at back
 *     exponentially (up to 24 h); a success clears it. Failures go to the
 *     activity log.
 *
 * Reconciling with the provider's balance (the ledger balance is always
 * income minus expense, so the gap is booked as a transaction):
 *   history     when the backfill completes, one "Opening balance (synced)"
 *               dated before the oldest imported movement
 *   every sync  a gap above dust (1e-8 crypto, 0.01 fiat) becomes one
 *               "Balance adjustment (synced)" per link per day, id
 *               adj:<linkId>:<date>, rewritten on later runs that day
 *   from_today  so the first sync books one adjustment and nothing older
 */

export const SYNC_MAX_PAGES = 5;
export const SYNC_MAX_ROWS = 1000;
export const FIRST_IMPORT_CAP = 2000;
/** A claim older than this belongs to a crashed run and can be taken over. */
export const SYNC_CLAIM_STALE_MINUTES = 10;
const MAX_BACKOFF_MINUTES = 24 * 60;
const BASE_BACKOFF_MINUTES = 15;

/** What a link stores in connection_accounts.cursor. */
export interface LinkCursor {
  /** The provider's own cursor. */
  p: unknown;
  /** The first import (history back to sync_from) is complete. */
  done: boolean;
  /** Rows imported by the first import so far (capped at FIRST_IMPORT_CAP). */
  imported: number;
  /** The opening balance (history mode) has been booked. */
  opened: boolean;
}

export const readLinkCursor = (raw: unknown): LinkCursor => {
  const c = (raw ?? {}) as Partial<LinkCursor>;
  return {
    p: c.p ?? null,
    done: Boolean(c.done),
    imported: Number(c.imported ?? 0) || 0,
    opened: Boolean(c.opened),
  };
};

/** What the fetch phase hands to the write phase for one link. */
interface FetchedLink {
  link: LinkRow;
  /** The cursor the fetch started from (compared again under the row lock). */
  startCursor: unknown;
  items: NormalizedTxn[];
  next: LinkCursor;
  hasMore: boolean;
  providerUnits: bigint;
}

export type SyncTrigger = 'link' | 'manual' | 'scheduled';

export interface LinkSyncResult {
  linkId: string;
  accountId: string;
  imported: number;
  providerBalance: string;
  ledgerBalance: string;
  adjustment: string | null;
  hasMore: boolean;
}

export interface SyncResult {
  connectionId: string;
  imported: number;
  links: LinkSyncResult[];
}

export class ConnectionSyncError extends AppError {
  constructor(
    readonly code: ConnectionErrorCode,
    message: string,
  ) {
    super(message, code === 'INVALID_ADDRESS' ? 400 : 502);
  }
}

export interface ActivitySink {
  log(
    payload: {
      entityType: string;
      entityId: string;
      action: string;
      oldValues?: Record<string, any> | null;
      newValues?: Record<string, any> | null;
    },
    context: { workspaceId: string; userId: string | null },
  ): Promise<void>;
}

export interface ConnectionSyncDeps {
  db: Pick<DatabaseFacade, 'transaction' | 'query'>;
  connections: ConnectionRepository;
  links: ConnectionAccountRepository;
  transactions: TransactionRepository;
  /** TransactionService.recomputeAccountBalance. */
  recomputeBalance(accountId: string, trx: DatabaseFacade): Promise<unknown>;
  registry: ProviderRegistry;
  secretBox: SecretBox;
  /** The owner's plan: minutes between scheduled syncs. */
  syncIntervalMinutes(workspaceId: string): Promise<number>;
  activity?: ActivitySink;
  now?: () => Date;
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export class ConnectionSyncService {
  private readonly now: () => Date;

  constructor(private readonly deps: ConnectionSyncDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** Decrypts the connection for its provider. */
  providerConnection(conn: ConnectionRow): ProviderConnection {
    if (!conn.credentialsEnc)
      throw new ConnectionSyncError('UNKNOWN', 'Connection has no address.');
    return {
      id: conn.id,
      address: this.deps.secretBox.decrypt(conn.credentialsEnc),
      metadata: conn.metadata ?? {},
    };
  }

  /**
   * The decrypted connection with tokens that are good to use. OAuth sources
   * roll their tokens: that happens under a row lock on the connection, and the
   * new pair is stored before the lock is released, so two runs can't both
   * spend the same refresh token. This is the one provider call made inside a
   * DB transaction (a single short request).
   */
  async freshConnection(
    conn: ConnectionRow,
    provider: ConnectionProvider,
  ): Promise<ProviderConnection> {
    const oauth = provider.oauth;
    if (!oauth) return this.providerConnection(conn);
    return this.deps.db.transaction(async (trx) => {
      const connections = this.deps.connections.withDb(trx);
      const locked = await connections.findByIdForUpdate(conn.id);
      if (!locked) throw new AppError('Connection not found', 404);
      const source = this.providerConnection(locked);
      const rolled = await oauth.refresh(source.address, this.now());
      if (!rolled) return source;
      await connections.updateCredentials(conn.id, this.deps.secretBox.encrypt(rolled));
      return { ...source, address: rolled };
    });
  }

  providerFor(conn: ConnectionRow): ConnectionProvider {
    const provider = this.deps.registry.get(conn.provider);
    if (!provider) throw new ConnectionSyncError('UNKNOWN', 'This source is not supported.');
    if (!provider.isAvailable().available) {
      throw new ConnectionSyncError(
        'PROVIDER_DOWN',
        `${provider.name} is not available right now.`,
      );
    }
    return provider;
  }

  async syncConnection(
    connectionId: string,
    options: { trigger: SyncTrigger; userId?: string | null } = { trigger: 'manual' },
  ): Promise<SyncResult> {
    const conn = await this.deps.connections.findById(connectionId);
    if (!conn) throw new AppError('Connection not found', 404);
    if (conn.status === 'disconnected') {
      return { connectionId, imported: 0, links: [] };
    }

    // 1. Claim: one atomic UPDATE, nothing held while the provider is called.
    const claim = await this.deps.connections.claimSync(connectionId, SYNC_CLAIM_STALE_MINUTES);
    if (!claim) {
      const busy = new AppError('This connection is already syncing.', 409);
      (busy as any).code = 'SYNC_IN_PROGRESS';
      throw busy;
    }

    let released = false;
    const touched = new Set<string>();
    try {
      const provider = this.providerFor(conn);
      const source = await this.freshConnection(conn, provider);
      const links = await this.deps.links.findByConnection(connectionId);

      // 2. Fetch: every provider call, with no DB transaction open.
      const fetched: FetchedLink[] = [];
      for (const link of links) fetched.push(await this.fetchLink(provider, source, link));

      // 3. Write: one short transaction per link.
      const results: LinkSyncResult[] = [];
      for (const f of fetched) {
        results.push(await this.deps.db.transaction((trx) => this.writeLink(trx, conn, f)));
        touched.add(f.link.accountId);
      }

      // 4. Release the claim with the outcome.
      const pending = results.some((r) => r.hasMore);
      const interval = await this.deps.syncIntervalMinutes(conn.workspaceId);
      const next = new Date(this.now().getTime() + (pending ? 1 : interval) * 60_000);
      await this.deps.connections.markSynced(connectionId, next, claim);
      released = true;

      for (const accountId of touched) {
        await this.deps.transactions.invalidateAccountStatsCache(accountId);
      }
      return {
        connectionId,
        imported: results.reduce((sum, r) => sum + r.imported, 0),
        links: results,
      };
    } catch (error) {
      const code = errorCodeOf(error);
      const message =
        error instanceof ProviderError || error instanceof ConnectionSyncError
          ? error.message
          : 'The sync failed.';
      const failures = conn.consecutiveFailures + 1;
      const delay = Math.min(MAX_BACKOFF_MINUTES, BASE_BACKOFF_MINUTES * 2 ** (failures - 1));
      await this.deps.connections.markFailed(
        connectionId,
        code === 'UNKNOWN' && error instanceof ConnectionSyncError ? error.code : code,
        message,
        new Date(this.now().getTime() + delay * 60_000),
        claim,
      );
      released = true;
      // Rows a committed link wrote are in; refresh their stats either way.
      for (const accountId of touched) {
        await this.deps.transactions.invalidateAccountStatsCache(accountId).catch(() => undefined);
      }
      if (!(error instanceof ProviderError)) {
        console.error('[ConnectionSync] sync failed', {
          connectionId,
          provider: conn.provider,
          error: (error as Error)?.message,
        });
      }
      this.deps.activity
        ?.log(
          {
            entityType: 'connection',
            entityId: connectionId,
            action: 'sync_failed',
            newValues: { code, trigger: options.trigger, provider: conn.provider },
          },
          { workspaceId: conn.workspaceId, userId: options.userId ?? null },
        )
        .catch(() => {});
      if (error instanceof ConnectionSyncError) throw error;
      throw new ConnectionSyncError(code, message);
    } finally {
      // Never leave the connection claimed (e.g. markFailed itself failed).
      if (!released) {
        await this.deps.connections.releaseClaim(connectionId, claim).catch(() => undefined);
      }
    }
  }

  /** Fetch phase for one link: pages from its stored cursor and the provider balance. */
  private async fetchLink(
    provider: ConnectionProvider,
    source: ProviderConnection,
    link: LinkRow,
  ): Promise<FetchedLink> {
    const state = readLinkCursor(link.cursor);
    const providerLink = {
      id: link.id,
      assetKey: link.assetKey,
      chainId: link.chainId,
      currencyCode: link.currencyCode,
    };

    const fetched = await provider.fetchTransactions(source, providerLink, state.p, {
      since: link.syncFrom,
      maxPages: SYNC_MAX_PAGES,
      maxRows: SYNC_MAX_ROWS,
    });
    const items = fetched.items.filter((item) => toUnits(item.amount) > 0n);

    const next: LinkCursor = { ...state, p: fetched.nextCursor };
    let hasMore = fetched.hasMore;
    if (!state.done) {
      // Counted as fetched (overlap included): the cap only needs to be approximate.
      next.imported = state.imported + items.length;
      if (!fetched.hasMore) next.done = true;
      else if (next.imported >= FIRST_IMPORT_CAP) {
        // Busy wallet: stop the first import here; the opening balance covers the rest.
        next.p = await provider.skipBackfill(source, providerLink, fetched.nextCursor);
        next.done = true;
        hasMore = false;
      }
    }

    const providerUnits = toUnits(await provider.fetchBalance(source, providerLink));
    return { link, startCursor: link.cursor ?? null, items, next, hasMore, providerUnits };
  }

  /**
   * Write phase for one link, inside one short transaction: re-read the link (row
   * lock) and refuse to move its cursor if another run moved it since the fetch,
   * insert the rows, reconcile, save the cursor, recompute the balance.
   */
  private async writeLink(
    trx: DatabaseFacade,
    conn: ConnectionRow,
    f: FetchedLink,
  ): Promise<LinkSyncResult> {
    const { link } = f;
    const transactions = this.deps.transactions.withDb(trx);
    const links = this.deps.links.withDb(trx);
    const skipped = (balance: string): LinkSyncResult => ({
      linkId: link.id,
      accountId: link.accountId,
      imported: 0,
      providerBalance: fromUnits(f.providerUnits),
      ledgerBalance: fromUnits(toUnits(balance)),
      adjustment: null,
      hasMore: false,
    });

    const current = await links.findByIdForUpdate(link.id);
    if (!current) return skipped('0'); // unlinked while we were fetching
    if (JSON.stringify(current.cursor ?? null) !== JSON.stringify(f.startCursor)) {
      // An overlapping (taken-over) run already advanced this link: don't go back.
      console.warn('[ConnectionSync] cursor moved during the fetch; skipping', { linkId: link.id });
      return skipped(await transactions.getAccountBalanceExact(link.accountId));
    }

    const rows: ImportedTransactionRow[] = f.items.map((item) => ({
      accountId: link.accountId,
      userId: conn.createdBy,
      workspaceId: conn.workspaceId,
      type: item.type,
      amount: fromUnits(toUnits(item.amount)),
      currency: link.currencyCode,
      description: item.description.slice(0, 500),
      date: item.date,
      counterparty: item.counterparty ? item.counterparty.slice(0, 255) : null,
      connectionAccountId: link.id,
      externalId: item.externalId.slice(0, 160),
      source: 'sync',
    }));
    const imported = await transactions.insertImported(rows);

    const next = { ...f.next };
    const dust = dustUnits(isCrypto(link.currencyCode) ? 'crypto' : 'fiat');
    let adjustment: string | null = null;

    if (next.done) {
      if (link.syncMode === 'history' && !next.opened) {
        const ledger = toUnits(await transactions.getAccountBalanceExact(link.accountId));
        const gap = f.providerUnits - ledger;
        if (absUnits(gap) > dust) {
          const oldest =
            (await transactions.oldestSyncedDate(link.id)) ?? link.syncFrom ?? this.now();
          await transactions.insertImported([
            this.adjustmentRow(conn, link, gap, new Date(oldest.getTime() - 1000), {
              externalId: `open:${link.id}`,
              description: 'Opening balance (synced)',
            }),
          ]);
          adjustment = fromUnits(gap);
        }
        next.opened = true;
      } else {
        const today = this.now();
        const externalId = `adj:${link.id}:${dayKey(today)}`;
        await transactions.deleteLinkRow(link.id, externalId);
        const ledger = toUnits(await transactions.getAccountBalanceExact(link.accountId));
        const gap = f.providerUnits - ledger;
        if (absUnits(gap) > dust) {
          await transactions.insertImported([
            this.adjustmentRow(conn, link, gap, today, {
              externalId,
              description: 'Balance adjustment (synced)',
            }),
          ]);
          adjustment = fromUnits(gap);
        }
      }
    }

    await links.saveSyncState(link.id, {
      cursor: next,
      lastProviderBalance: fromUnits(f.providerUnits),
    });
    await this.deps.recomputeBalance(link.accountId, trx);
    const ledgerBalance = await transactions.getAccountBalanceExact(link.accountId);

    return {
      linkId: link.id,
      accountId: link.accountId,
      imported,
      providerBalance: fromUnits(f.providerUnits),
      ledgerBalance: fromUnits(toUnits(ledgerBalance)),
      adjustment,
      hasMore: f.hasMore,
    };
  }

  private adjustmentRow(
    conn: ConnectionRow,
    link: LinkRow,
    gap: bigint,
    date: Date,
    row: { externalId: string; description: string },
  ): ImportedTransactionRow {
    return {
      accountId: link.accountId,
      userId: conn.createdBy,
      workspaceId: conn.workspaceId,
      type: gap > 0n ? 'income' : 'expense',
      amount: fromUnits(absUnits(gap)),
      currency: link.currencyCode,
      description: row.description,
      date,
      counterparty: null,
      connectionAccountId: link.id,
      externalId: row.externalId,
      source: 'adjustment',
    };
  }
}
