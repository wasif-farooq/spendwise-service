import { AppError } from '@shared/errors/AppError';
import type { DatabaseFacade } from '@facades/DatabaseFacade';
import type { SecretBox } from '@shared/crypto/secretBox';
import { isCrypto } from '@domains/currencies/currencies';
import type { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { ProviderError } from '../providers/errors';
import type { ProviderInfo, ProviderRegistry } from '../providers/ProviderRegistry';
import type { DiscoveredAsset, ProviderId, SyncMode } from '../providers/types';
import { PROVIDER_IDS } from '../providers/types';
import type { ConnectionAccountRepository } from '../repositories/ConnectionAccountRepository';
import type { ConnectionRepository } from '../repositories/ConnectionRepository';
import type { ConnectionRow, LinkRow, OwnerLimits } from '../repositories/types';
import {
  ActivitySink,
  ConnectionSyncService,
  SyncResult,
  readLinkCursor,
} from './ConnectionSyncService';

/**
 * Connected accounts: connect a source, discover its assets, link each asset to
 * an account (existing or new), unlink or delete. Syncing is ConnectionSyncService.
 *
 * Errors carry a `code` (and for plan limits `feature` + `usage`) so the apps
 * can branch: 402 CONNECTION_LIMIT_REACHED / PLAN_UPGRADE_REQUIRED, 409
 * CONNECTION_EXISTS / ACCOUNT_ALREADY_LINKED, 400 INVALID_ADDRESS /
 * CURRENCY_MISMATCH / ASSET_NOT_SUPPORTED / CURRENCY_NOT_SUPPORTED, 503
 * PROVIDER_UNAVAILABLE / CONNECTIONS_UNAVAILABLE, 502 provider failures.
 */

export class ConnectionError extends AppError {
  constructor(
    message: string,
    statusCode: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message, statusCode);
  }
}

/** Free-plan values for owners without a subscription (migration 035 defaults). */
const FREE_DEFAULTS = {
  connectedWallets: 2,
  hasPaymentConnections: false,
  connectionSyncIntervalMinutes: 360,
  transactionHistoryMonths: 3,
  accounts: 5,
};

/** The first sync answers inline unless it takes longer than this; then 202. */
export const FIRST_SYNC_INLINE_MS = 5000;

export interface ConnectionsUsage {
  planName: string | null;
  wallets: { used: number; limit: number | null };
  paymentConnections: boolean;
  syncIntervalMinutes: number;
  /** null = unlimited history. */
  historyMonths: number | null;
}

export interface LinkDto {
  id: string;
  accountId: string;
  accountName: string | null;
  assetKey: string;
  chainId: string | null;
  chainName: string | null;
  symbol: string | null;
  currencyCode: string;
  syncMode: SyncMode;
  syncFrom: string | null;
  providerBalance: string | null;
  lastSyncedAt: string | null;
  importedCount: number;
  backfillComplete: boolean;
}

export interface ConnectionDto {
  id: string;
  provider: ProviderId;
  kind: string;
  providerName: string;
  displayName: string;
  /** Shortened address (`0x4f2a…9c1e`); the full address is never returned. */
  addressHint: string | null;
  chains: string[];
  status: string;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  lastError: string | null;
  lastErrorCode: string | null;
  consecutiveFailures: number;
  createdAt: string;
  links: LinkDto[];
}

export interface DiscoveredAssetDto extends DiscoveredAsset {
  /** Already linked in this connection to that account. */
  linkedAccountId: string | null;
  /** An existing account of the same currency, not linked yet. */
  suggestedAccountId: string | null;
}

export interface CandidateAccount {
  id: string;
  name: string;
  currency: string;
  type: string;
  linked: boolean;
}

export interface LinkRequest {
  assetKey: string;
  accountId?: string;
  newAccount?: { name: string; color?: string };
  syncMode: SyncMode;
}

/** Creating accounts the way POST /accounts does (plan limit, crypto flag). */
export interface AccountGateway {
  listAccounts(
    workspaceId: string,
  ): Promise<Array<{ id: string; name: string; currency: string; type: string }>>;
  /** Throws (403, as POST /accounts) when adding `adding` accounts passes the plan limit. */
  assertCanAdd(workspaceId: string, ownerId: string, adding: number): Promise<void>;
  /** Account limit for the wizard's "uses 5 of 5" line; null = unlimited. */
  usage(workspaceId: string, ownerId: string): Promise<{ used: number; limit: number | null }>;
  isCryptoEnabled(): Promise<boolean>;
  create(
    trx: DatabaseFacade,
    input: { workspaceId: string; userId: string; name: string; currency: string; color?: string },
  ): Promise<{ id: string }>;
}

export interface ConnectionServiceDeps {
  db: Pick<DatabaseFacade, 'transaction' | 'query'>;
  connections: ConnectionRepository;
  links: ConnectionAccountRepository;
  transactions: TransactionRepository;
  recomputeBalance(accountId: string, trx: DatabaseFacade): Promise<unknown>;
  registry: ProviderRegistry;
  /** null when CONNECTIONS_ENC_KEYS isn't configured. */
  secretBox: SecretBox | null;
  sync: ConnectionSyncService;
  accounts: AccountGateway;
  activity?: ActivitySink;
  now?: () => Date;
  firstSyncInlineMs?: number;
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

const limitNumber = (value: unknown, fallback: number): number | null => {
  const n = typeof value === 'number' ? value : value === undefined ? fallback : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n < 0 ? null : n;
};

const isUniqueViolation = (error: unknown) => (error as any)?.code === '23505';

export class ConnectionService {
  private readonly now: () => Date;

  constructor(private readonly deps: ConnectionServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  listProviders(): ProviderInfo[] {
    return this.deps.registry.describe();
  }

  // ----- plan limits -----

  private async ownerLimits(workspaceId: string): Promise<OwnerLimits> {
    const limits = await this.deps.connections.findOwnerLimits(workspaceId);
    if (!limits) throw new AppError('Workspace not found', 404);
    return limits;
  }

  async usage(workspaceId: string, owner?: OwnerLimits): Promise<ConnectionsUsage> {
    const o = owner ?? (await this.ownerLimits(workspaceId));
    const l = o.limits ?? {};
    const used = await this.deps.connections.countWalletsForOwner(o.ownerId);
    const interval = limitNumber(
      l.connectionSyncIntervalMinutes,
      FREE_DEFAULTS.connectionSyncIntervalMinutes,
    );
    return {
      planName: o.planName,
      wallets: { used, limit: limitNumber(l.connectedWallets, FREE_DEFAULTS.connectedWallets) },
      paymentConnections:
        l.hasPaymentConnections === undefined
          ? FREE_DEFAULTS.hasPaymentConnections
          : l.hasPaymentConnections === true || l.hasPaymentConnections === 'true',
      syncIntervalMinutes: interval ?? 60,
      historyMonths: limitNumber(
        l.transactionHistoryMonths,
        FREE_DEFAULTS.transactionHistoryMonths,
      ),
    };
  }

  /** Minutes between scheduled syncs on the owner's plan. */
  async syncIntervalMinutes(workspaceId: string): Promise<number> {
    return (await this.usage(workspaceId)).syncIntervalMinutes;
  }

  // ----- reading -----

  private toDto(conn: ConnectionRow, links: LinkRow[]): ConnectionDto {
    const provider = this.deps.registry.get(conn.provider);
    return {
      id: conn.id,
      provider: conn.provider,
      kind: conn.kind,
      providerName: provider?.name ?? conn.provider,
      displayName: conn.displayName,
      addressHint: conn.metadata?.addressHint ?? null,
      chains: Array.isArray(conn.metadata?.chains) ? conn.metadata.chains : [],
      status: conn.status,
      lastSyncedAt: iso(conn.lastSyncedAt),
      nextSyncAt: iso(conn.nextSyncAt),
      lastError: conn.lastError,
      lastErrorCode: conn.lastErrorCode,
      consecutiveFailures: conn.consecutiveFailures,
      createdAt: iso(conn.createdAt)!,
      links: links.map((link) => {
        const asset = provider?.describeAsset(link.assetKey) ?? null;
        return {
          id: link.id,
          accountId: link.accountId,
          accountName: link.accountName ?? null,
          assetKey: link.assetKey,
          chainId: link.chainId,
          chainName: asset?.chainName ?? null,
          symbol: asset?.symbol ?? link.currencyCode,
          currencyCode: link.currencyCode,
          syncMode: link.syncMode,
          syncFrom: iso(link.syncFrom),
          providerBalance: link.lastProviderBalance,
          lastSyncedAt: iso(link.lastSyncedAt),
          importedCount: link.importedCount ?? 0,
          backfillComplete: readLinkCursor(link.cursor).done,
        };
      }),
    };
  }

  async list(
    workspaceId: string,
  ): Promise<{ connections: ConnectionDto[]; usage: ConnectionsUsage }> {
    const rows = await this.deps.connections.listByWorkspace(workspaceId);
    const links = await this.deps.links.findByConnections(rows.map((r) => r.id));
    return {
      connections: rows.map((row) =>
        this.toDto(
          row,
          links.filter((l) => l.connectionId === row.id),
        ),
      ),
      usage: await this.usage(workspaceId),
    };
  }

  async get(workspaceId: string, id: string): Promise<ConnectionDto> {
    const conn = await this.find(workspaceId, id);
    return this.toDto(conn, await this.deps.links.findByConnection(conn.id));
  }

  private async find(workspaceId: string, id: string): Promise<ConnectionRow> {
    const conn = await this.deps.connections.findInWorkspace(id, workspaceId);
    if (!conn) throw new ConnectionError('Connection not found.', 404, 'CONNECTION_NOT_FOUND');
    return conn;
  }

  // ----- connect -----

  async create(
    workspaceId: string,
    userId: string,
    input: { provider: string; address?: string; displayName?: string; chains?: string[] },
  ): Promise<ConnectionDto> {
    if (!PROVIDER_IDS.includes(input.provider as ProviderId)) {
      throw new ConnectionError('Unknown source.', 400, 'PROVIDER_NOT_SUPPORTED');
    }
    const owner = await this.ownerLimits(workspaceId);
    const usage = await this.usage(workspaceId, owner);
    const info = this.listProviders().find((p) => p.id === input.provider)!;

    if (info.kind === 'payment' && !usage.paymentConnections) {
      throw new ConnectionError(
        `${info.name} connections need a paid plan. Upgrade to connect ${info.name}.`,
        402,
        'PLAN_UPGRADE_REQUIRED',
        { feature: 'paymentConnections', usage: usage.wallets },
      );
    }
    if (
      info.kind === 'crypto_wallet' &&
      usage.wallets.limit !== null &&
      usage.wallets.used >= usage.wallets.limit
    ) {
      throw new ConnectionError(
        `You have reached the limit of ${usage.wallets.limit} connected wallets. Upgrade your plan to connect more.`,
        402,
        'CONNECTION_LIMIT_REACHED',
        { feature: 'connectedWallets', usage: usage.wallets },
      );
    }

    const provider = this.deps.registry.get(input.provider);
    if (!provider || !provider.isAvailable().available) {
      throw new ConnectionError(
        info.comingSoon
          ? `${info.name} is coming soon.`
          : `${info.name} isn't available right now.`,
        503,
        'PROVIDER_UNAVAILABLE',
      );
    }
    const box = this.deps.secretBox;
    if (!box) {
      throw new ConnectionError(
        'Connecting accounts is not configured.',
        503,
        'CONNECTIONS_UNAVAILABLE',
      );
    }

    let validated;
    try {
      validated = provider.validate({ address: input.address ?? '', chains: input.chains });
    } catch (error) {
      if (error instanceof ProviderError) {
        throw new ConnectionError(error.message, 400, error.code);
      }
      throw error;
    }

    const displayName = (input.displayName ?? '').trim().slice(0, 100) || `${provider.name} wallet`;
    let conn: ConnectionRow;
    try {
      conn = await this.deps.connections.create({
        workspaceId,
        createdBy: userId,
        provider: provider.id,
        kind: provider.kind,
        displayName,
        externalRef: box.blindIndex(`${provider.id}:${validated.address}`),
        credentialsEnc: box.encrypt(validated.address),
        metadata: validated.metadata,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConnectionError('This wallet is already connected.', 409, 'CONNECTION_EXISTS');
      }
      throw error;
    }

    this.log(workspaceId, userId, conn.id, 'connect', {
      provider: conn.provider,
      chains: validated.metadata.chains,
    });
    return this.toDto(conn, []);
  }

  // ----- discover -----

  async discover(
    workspaceId: string,
    id: string,
  ): Promise<{
    assets: DiscoveredAssetDto[];
    accounts: CandidateAccount[];
    accountsUsage: { used: number; limit: number | null };
  }> {
    const conn = await this.find(workspaceId, id);
    const provider = this.deps.sync.providerFor(conn);
    let assets: DiscoveredAsset[];
    try {
      assets = await provider.discoverAssets(this.deps.sync.providerConnection(conn));
    } catch (error) {
      if (error instanceof ProviderError) {
        throw new ConnectionError(
          error.message,
          error.code === 'INVALID_ADDRESS' ? 400 : 502,
          error.code,
        );
      }
      throw error;
    }

    const accounts = await this.deps.accounts.listAccounts(workspaceId);
    const linked = await this.deps.links.linkedAccountIds(workspaceId);
    const ownLinks = await this.deps.links.findByConnection(conn.id);
    const owner = await this.ownerLimits(workspaceId);
    const taken = new Set<string>();

    const dto = assets.map((asset) => {
      const existing = ownLinks.find((l) => l.assetKey === asset.assetKey);
      let suggested: string | null = null;
      if (!existing && asset.supported && asset.currencyCode) {
        const match = accounts.find(
          (a) => a.currency === asset.currencyCode && !linked.has(a.id) && !taken.has(a.id),
        );
        if (match) {
          suggested = match.id;
          taken.add(match.id);
        }
      }
      return {
        ...asset,
        linkedAccountId: existing?.accountId ?? null,
        suggestedAccountId: suggested,
      };
    });

    return {
      assets: dto,
      accounts: accounts.map((a) => ({ ...a, linked: linked.has(a.id) })),
      accountsUsage: await this.deps.accounts.usage(workspaceId, owner.ownerId),
    };
  }

  // ----- link -----

  async link(
    workspaceId: string,
    userId: string,
    id: string,
    requests: LinkRequest[],
  ): Promise<{ connection: ConnectionDto; sync: SyncResult | null; pending: boolean }> {
    const conn = await this.find(workspaceId, id);
    const provider = this.deps.sync.providerFor(conn);
    if (requests.length === 0) {
      throw new ConnectionError('Choose at least one asset.', 400, 'VALIDATION_ERROR');
    }
    const seen = new Set<string>();
    const accounts = await this.deps.accounts.listAccounts(workspaceId);
    const owner = await this.ownerLimits(workspaceId);
    const usage = await this.usage(workspaceId, owner);
    const now = this.now();

    const plan = requests.map((req) => {
      const asset = provider.describeAsset(req.assetKey);
      if (!asset) {
        throw new ConnectionError('That asset is not supported yet.', 400, 'ASSET_NOT_SUPPORTED');
      }
      if (seen.has(asset.assetKey)) {
        throw new ConnectionError('Each asset can be linked once.', 400, 'VALIDATION_ERROR');
      }
      seen.add(asset.assetKey);
      if (req.accountId) {
        const account = accounts.find((a) => a.id === req.accountId);
        if (!account) throw new ConnectionError('Account not found.', 404, 'ACCOUNT_NOT_FOUND');
        if (account.currency !== asset.currencyCode) {
          throw new ConnectionError(
            `${account.name} is in ${account.currency}; ${asset.symbol} needs a ${asset.currencyCode} account.`,
            400,
            'CURRENCY_MISMATCH',
          );
        }
      } else if (!req.newAccount?.name?.trim()) {
        throw new ConnectionError('Name the new account.', 400, 'VALIDATION_ERROR');
      }
      let syncFrom: Date | null = now;
      if (req.syncMode === 'history') {
        if (usage.historyMonths === null) syncFrom = null;
        else {
          syncFrom = new Date(now);
          syncFrom.setUTCMonth(syncFrom.getUTCMonth() - usage.historyMonths);
        }
      }
      return { req, asset, syncFrom };
    });

    const creating = plan.filter((p) => !p.req.accountId);
    if (creating.length > 0) {
      if (
        creating.some((p) => isCrypto(p.asset.currencyCode)) &&
        !(await this.deps.accounts.isCryptoEnabled())
      ) {
        throw new ConnectionError(
          'Crypto accounts are not available yet.',
          400,
          'CURRENCY_NOT_SUPPORTED',
        );
      }
      await this.deps.accounts.assertCanAdd(workspaceId, owner.ownerId, creating.length);
    }

    try {
      await this.deps.db.transaction(async (trx) => {
        const links = this.deps.links.withDb(trx);
        for (const { req, asset, syncFrom } of plan) {
          const accountId =
            req.accountId ??
            (
              await this.deps.accounts.create(trx, {
                workspaceId,
                userId,
                name: req.newAccount!.name.trim().slice(0, 100),
                currency: asset.currencyCode,
                color: req.newAccount!.color,
              })
            ).id;
          await links.create({
            connectionId: conn.id,
            accountId,
            assetKey: asset.assetKey,
            chainId: asset.chainId,
            currencyCode: asset.currencyCode,
            syncMode: req.syncMode,
            syncFrom,
          });
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConnectionError(
          'That account or asset is already linked.',
          409,
          'ACCOUNT_ALREADY_LINKED',
        );
      }
      throw error;
    }

    this.log(workspaceId, userId, conn.id, 'link', {
      assets: plan.map((p) => p.asset.assetKey),
    });

    // First sync: answer with it when it's quick, else 202 and let it finish.
    const running = this.deps.sync.syncConnection(conn.id, { trigger: 'link', userId });
    running.catch(() => {});
    const inlineMs = this.deps.firstSyncInlineMs ?? FIRST_SYNC_INLINE_MS;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), inlineMs);
    });
    let sync: SyncResult | null = null;
    let pending = false;
    try {
      const outcome = await Promise.race([running, timeout]);
      if (outcome === 'timeout') pending = true;
      else sync = outcome;
    } catch {
      // The failure is stored on the connection (status, last_error_code).
    } finally {
      if (timer) clearTimeout(timer);
    }

    return { connection: await this.get(workspaceId, conn.id), sync, pending };
  }

  // ----- sync -----

  async sync(workspaceId: string, userId: string, id: string) {
    const conn = await this.find(workspaceId, id);
    const result = await this.deps.sync.syncConnection(conn.id, { trigger: 'manual', userId });
    return { connection: await this.get(workspaceId, conn.id), result };
  }

  // ----- unlink / delete -----

  async unlink(
    workspaceId: string,
    userId: string,
    id: string,
    linkId: string,
    deleteImported: boolean,
  ): Promise<ConnectionDto> {
    const conn = await this.find(workspaceId, id);
    const link = await this.deps.links.findById(linkId);
    if (!link || link.connectionId !== conn.id) {
      throw new ConnectionError('Link not found.', 404, 'LINK_NOT_FOUND');
    }
    await this.deps.db.transaction(async (trx) => {
      await this.removeLink(trx, link, deleteImported);
    });
    await this.deps.transactions.invalidateAccountStatsCache(link.accountId);
    this.log(workspaceId, userId, conn.id, 'unlink', { assetKey: link.assetKey, deleteImported });
    return this.get(workspaceId, conn.id);
  }

  async remove(
    workspaceId: string,
    userId: string,
    id: string,
    deleteImported: boolean,
  ): Promise<void> {
    const conn = await this.find(workspaceId, id);
    const links = await this.deps.links.findByConnection(conn.id);
    await this.deps.db.transaction(async (trx) => {
      for (const link of links) await this.removeLink(trx, link, deleteImported);
      await this.deps.connections.withDb(trx).delete(conn.id);
    });
    for (const link of links)
      await this.deps.transactions.invalidateAccountStatsCache(link.accountId);
    this.log(workspaceId, userId, conn.id, 'disconnect', {
      provider: conn.provider,
      deleteImported,
    });
  }

  /** Deletes the link; its rows go, or stay as plain transactions. The account always stays. */
  private async removeLink(trx: DatabaseFacade, link: LinkRow, deleteImported: boolean) {
    const transactions = this.deps.transactions.withDb(trx);
    if (deleteImported) {
      await transactions.deleteImportedForLink(link.id);
    } else {
      await transactions.releaseImportedForLink(link.id);
    }
    await this.deps.links.withDb(trx).delete(link.id);
    await this.deps.recomputeBalance(link.accountId, trx);
  }

  private log(
    workspaceId: string,
    userId: string | null,
    connectionId: string,
    action: string,
    values: Record<string, unknown>,
  ) {
    this.deps.activity
      ?.log(
        { entityType: 'connection', entityId: connectionId, action, newValues: values },
        { workspaceId, userId },
      )
      .catch(() => {});
  }
}
