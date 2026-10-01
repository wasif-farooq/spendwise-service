import { randomUUID } from 'crypto';
import { SecretBox } from '@shared/crypto/secretBox';
import { fromUnits, toUnits } from '@domains/connections/providers/decimal';
import { ProviderRegistry } from '@domains/connections/providers/ProviderRegistry';
import type {
  ConnectionProvider,
  DiscoveredAsset,
  FetchOptions,
  NormalizedTxn,
} from '@domains/connections/providers/types';
import type { ConnectionRow, LinkRow, OwnerLimits } from '@domains/connections/repositories/types';
import { ConnectionService, AccountGateway } from '@domains/connections/services/ConnectionService';
import { ConnectionSyncService } from '@domains/connections/services/ConnectionSyncService';
import type { ImportedTransactionRow } from '@domains/transactions/repositories/TransactionRepository';

/**
 * In-memory stand-ins for the repositories and a provider, so the sync engine
 * and the connection service run end to end without Postgres or a network.
 */

export interface FakeTxn extends ImportedTransactionRow {
  id: string;
  source: 'manual' | 'sync' | 'adjustment';
  connectionAccountId: string;
  externalId: string;
}

export class Store {
  connections = new Map<string, ConnectionRow>();
  links = new Map<string, LinkRow>();
  txns: Array<Omit<FakeTxn, 'connectionAccountId' | 'externalId'> & { connectionAccountId: string | null; externalId: string | null }> = [];
  accounts = new Map<string, { id: string; workspaceId: string; name: string; currency: string; type: string; balance: string }>();
  limits: OwnerLimits = { ownerId: 'owner-1', planName: 'Pro Monthly', limits: { connectedWallets: -1, hasPaymentConnections: true, connectionSyncIntervalMinutes: 60, transactionHistoryMonths: 12 } };
  lockHeld = false;
  workspaceOwner = 'owner-1';

  addAccount(workspaceId: string, name: string, currency: string, manual: Array<[('income' | 'expense'), string]> = []) {
    const id = randomUUID();
    this.accounts.set(id, { id, workspaceId, name, currency, type: 'investment', balance: '0' });
    for (const [type, amount] of manual) {
      this.txns.push({
        id: randomUUID(), accountId: id, userId: 'user-1', workspaceId, type, amount, currency,
        description: 'manual', date: new Date('2026-01-01'), counterparty: null,
        connectionAccountId: null, externalId: null, source: 'manual',
      });
    }
    this.recompute(id);
    return id;
  }

  balance(accountId: string): string {
    const units = this.txns
      .filter((t) => t.accountId === accountId)
      .reduce((sum, t) => sum + (t.type === 'income' ? 1n : -1n) * toUnits(t.amount), 0n);
    return fromUnits(units);
  }

  recompute(accountId: string) {
    const account = this.accounts.get(accountId)!;
    account.balance = this.balance(accountId);
  }

  rowsFor(linkId: string) {
    return this.txns.filter((t) => t.connectionAccountId === linkId);
  }
}

export const fakeDb = (store: Store) => {
  const trx: any = {
    query: async (sql: string) => {
      if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: !store.lockHeld }] };
      throw new Error(`Unexpected SQL in fake: ${sql}`);
    },
  };
  trx.transaction = async (cb: (t: any) => Promise<any>) => {
    // Roll back on error: snapshot and restore.
    const snapshot = {
      txns: store.txns.map((t) => ({ ...t })),
      links: new Map([...store.links].map(([k, v]) => [k, { ...v }])),
      accounts: new Map([...store.accounts].map(([k, v]) => [k, { ...v }])),
      connections: new Map([...store.connections].map(([k, v]) => [k, { ...v }])),
    };
    try {
      return await cb(trx);
    } catch (error) {
      store.txns = snapshot.txns;
      store.links = snapshot.links;
      store.accounts = snapshot.accounts;
      store.connections = snapshot.connections;
      throw error;
    }
  };
  return trx;
};

export const fakeConnections = (store: Store): any => {
  const repo: any = {
    withDb: () => repo,
    async create(data: any) {
      for (const c of store.connections.values()) {
        if (c.workspaceId === data.workspaceId && c.provider === data.provider && c.externalRef === data.externalRef) {
          throw Object.assign(new Error('duplicate'), { code: '23505' });
        }
      }
      const row: ConnectionRow = {
        id: randomUUID(), ...data, status: 'active', lastSyncedAt: null, nextSyncAt: new Date(),
        lastError: null, lastErrorCode: null, consecutiveFailures: 0, createdAt: new Date(), updatedAt: new Date(),
      };
      store.connections.set(row.id, row);
      return row;
    },
    findById: async (id: string) => store.connections.get(id) ?? null,
    findInWorkspace: async (id: string, ws: string) => {
      const c = store.connections.get(id);
      return c && c.workspaceId === ws ? c : null;
    },
    listByWorkspace: async (ws: string) => [...store.connections.values()].filter((c) => c.workspaceId === ws),
    countWalletsForOwner: async () =>
      [...store.connections.values()].filter((c) => c.kind === 'crypto_wallet' && c.status !== 'disconnected').length,
    findOwnerLimits: async () => store.limits,
    async markSynced(id: string, next: Date) {
      Object.assign(store.connections.get(id)!, {
        status: 'active', lastSyncedAt: new Date(), nextSyncAt: next, lastError: null, lastErrorCode: null, consecutiveFailures: 0,
      });
    },
    async markFailed(id: string, code: string, message: string, next: Date) {
      const c = store.connections.get(id)!;
      Object.assign(c, {
        status: code === 'REAUTH_REQUIRED' ? 'reauth_required' : 'error', lastErrorCode: code, lastError: message,
        nextSyncAt: next, consecutiveFailures: c.consecutiveFailures + 1,
      });
    },
    findDue: async (limit: number, now: Date) =>
      [...store.connections.values()]
        .filter((c) => c.status !== 'disconnected' && (!c.nextSyncAt || c.nextSyncAt <= now))
        .slice(0, limit),
    delete: async (id: string) => {
      store.connections.delete(id);
      for (const [k, l] of store.links) if (l.connectionId === id) store.links.delete(k);
    },
  };
  return repo;
};

export const fakeLinks = (store: Store): any => {
  const withCounts = (l: LinkRow): LinkRow => ({
    ...l,
    accountName: store.accounts.get(l.accountId)?.name,
    importedCount: store.rowsFor(l.id).length,
  });
  const repo: any = {
    withDb: () => repo,
    async create(data: any) {
      for (const l of store.links.values()) {
        if (l.accountId === data.accountId || (l.connectionId === data.connectionId && l.assetKey === data.assetKey)) {
          throw Object.assign(new Error('duplicate'), { code: '23505' });
        }
      }
      const row: LinkRow = { id: randomUUID(), ...data, cursor: null, lastProviderBalance: null, lastSyncedAt: null, createdAt: new Date() };
      store.links.set(row.id, row);
      return row;
    },
    findById: async (id: string) => store.links.get(id) ?? null,
    findByConnection: async (id: string) => [...store.links.values()].filter((l) => l.connectionId === id).map(withCounts),
    findByConnections: async (ids: string[]) => [...store.links.values()].filter((l) => ids.includes(l.connectionId)).map(withCounts),
    linkedAccountIds: async () => new Set([...store.links.values()].map((l) => l.accountId)),
    async saveSyncState(id: string, state: any) {
      Object.assign(store.links.get(id)!, {
        cursor: JSON.parse(JSON.stringify(state.cursor)), lastProviderBalance: state.lastProviderBalance, lastSyncedAt: new Date(),
      });
    },
    delete: async (id: string) => {
      store.links.delete(id);
    },
  };
  return repo;
};

export const fakeTransactions = (store: Store): any => {
  const repo: any = {
    withDb: () => repo,
    async insertImported(rows: ImportedTransactionRow[]) {
      let inserted = 0;
      for (const row of rows) {
        if (store.txns.some((t) => t.connectionAccountId === row.connectionAccountId && t.externalId === row.externalId)) continue;
        store.txns.push({ id: randomUUID(), ...row });
        inserted++;
      }
      return inserted;
    },
    async deleteImportedForLink(linkId: string) {
      const before = store.txns.length;
      store.txns = store.txns.filter((t) => t.connectionAccountId !== linkId);
      return before - store.txns.length;
    },
    async releaseImportedForLink(linkId: string) {
      let n = 0;
      for (const t of store.txns) {
        if (t.connectionAccountId === linkId) {
          Object.assign(t, { connectionAccountId: null, externalId: null, source: 'manual' });
          n++;
        }
      }
      return n;
    },
    async deleteLinkRow(linkId: string, externalId: string) {
      store.txns = store.txns.filter((t) => !(t.connectionAccountId === linkId && t.externalId === externalId));
    },
    async oldestSyncedDate(linkId: string) {
      const dates = store.rowsFor(linkId).filter((t) => t.source === 'sync').map((t) => t.date.getTime());
      return dates.length ? new Date(Math.min(...dates)) : null;
    },
    getAccountBalanceExact: async (accountId: string) => store.balance(accountId),
    invalidateAccountStatsCache: jest.fn(async () => undefined),
  };
  return repo;
};

/** A scriptable provider: a list of movements (newest first) and a balance. */
export class FakeProvider implements ConnectionProvider {
  id = 'crypto:bitcoin' as const;
  kind = 'crypto_wallet' as const;
  auth = 'address' as const;
  name = 'Bitcoin';
  description = 'test';
  movements: NormalizedTxn[] = [];
  balanceValue = '0';
  pageSize = 2;
  failWith: Error | null = null;
  skipped = 0;

  isAvailable() {
    return { available: true };
  }
  chains() {
    return [{ id: 'bitcoin', name: 'Bitcoin', nativeCurrency: 'BTC', available: true }];
  }
  validate(input: { address: string }) {
    if (!input.address.startsWith('bc1')) {
      throw Object.assign(new (require('@domains/connections/providers/errors').InvalidAddressError)());
    }
    return { address: input.address, metadata: { addressHint: 'bc1q…test', chains: [] } };
  }
  async discoverAssets(): Promise<DiscoveredAsset[]> {
    return [
      { assetKey: 'btc:native', chainId: null, chainName: 'Bitcoin', symbol: 'BTC', name: 'Bitcoin', currencyCode: 'BTC', balance: this.balanceValue, supported: true },
    ];
  }
  describeAsset(assetKey: string) {
    return assetKey === 'btc:native'
      ? { assetKey, chainId: null, chainName: 'Bitcoin', symbol: 'BTC', name: 'Bitcoin', currencyCode: 'BTC' }
      : null;
  }
  async fetchBalance() {
    if (this.failWith) throw this.failWith;
    return this.balanceValue;
  }
  /** Cursor = index into the oldest-first list of what's been seen. */
  async fetchTransactions(_c: unknown, _l: unknown, cursor: unknown, options: FetchOptions) {
    if (this.failWith) throw this.failWith;
    const oldestFirst = [...this.movements]
      .filter((m) => !options.since || m.date >= options.since)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const from = typeof cursor === 'number' ? cursor : 0;
    const take = this.pageSize * options.maxPages;
    const items = oldestFirst.slice(from, from + take);
    return { items, nextCursor: from + items.length, hasMore: from + items.length < oldestFirst.length };
  }
  async skipBackfill() {
    this.skipped++;
    return this.movements.length;
  }
}

export const build = (store: Store, provider = new FakeProvider(), now = () => new Date('2026-10-01T12:00:00Z')) => {
  const db = fakeDb(store);
  const connections = fakeConnections(store);
  const links = fakeLinks(store);
  const transactions = fakeTransactions(store);
  const registry = new ProviderRegistry([provider]);
  const secretBox = SecretBox.fromConfig(`1:${Buffer.alloc(32, 7).toString('base64')}`);
  const recomputeBalance = async (accountId: string) => store.recompute(accountId);
  const activity = { log: jest.fn(async () => undefined) };
  let service: ConnectionService;
  const sync = new ConnectionSyncService({
    db, connections, links, transactions, recomputeBalance, registry, secretBox,
    syncIntervalMinutes: async () => 60, activity, now,
  });
  const accounts: AccountGateway = {
    listAccounts: async (ws) => [...store.accounts.values()].filter((a) => a.workspaceId === ws),
    assertCanAdd: jest.fn(async () => undefined),
    usage: async () => ({ used: store.accounts.size, limit: 5 }),
    isCryptoEnabled: async () => true,
    create: async (_trx, input) => ({ id: store.addAccount(input.workspaceId, input.name, input.currency) }),
  };
  service = new ConnectionService({
    db, connections, links, transactions, recomputeBalance, registry, secretBox, sync, accounts, activity, now,
    firstSyncInlineMs: 2000,
  });
  return { service, sync, provider, activity, accounts, connections, transactions };
};

export const movement = (id: string, date: string, type: 'income' | 'expense', amount: string): NormalizedTxn => ({
  externalId: id, date: new Date(date), type, amount, description: `${type} ${id}`,
});
