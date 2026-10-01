import { DatabaseFacade } from '@facades/DatabaseFacade';
import type { CacheFacade } from '@facades/CacheFacade';
import { SecretBox } from '@shared/crypto/secretBox';
import { AccountRepository } from '@domains/accounts/repositories/AccountRepository';
import { AccountService } from '@domains/accounts/services/AccountService';
import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { TransactionService } from '@domains/transactions/services/TransactionService';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import type { ConnectionsConfig } from '../providers/crypto/types';
import { ConnectionAccountRepository } from '../repositories/ConnectionAccountRepository';
import { ConnectionRepository } from '../repositories/ConnectionRepository';
import { AccountGateway, ConnectionService } from './ConnectionService';
import { ActivitySink, ConnectionSyncService } from './ConnectionSyncService';

/** The feature flag (GET /api/v1/feature-flags) that switches connected accounts on. */
export const CONNECTED_ACCOUNTS_FLAG = 'connectedAccounts';

/** null when no keys are configured (connecting answers 503), logged once. */
export const secretBoxFromConfig = (config: ConnectionsConfig): SecretBox | null => {
  const keys = config.encryption?.keys;
  if (!keys) return null;
  try {
    return SecretBox.fromConfig(keys, config.encryption?.active);
  } catch (error) {
    console.error('[Connections] CONNECTIONS_ENC_KEYS is invalid:', (error as Error).message);
    return null;
  }
};

export interface ConnectionServicesOptions {
  config: ConnectionsConfig;
  cache?: CacheFacade;
  activity?: ActivitySink;
  registry?: ProviderRegistry;
  accounts?: AccountGateway;
  isCryptoEnabled?: () => Promise<boolean>;
  checkAccountLimit?: (ownerId: string, currentCount: number) => Promise<void>;
}

/** Accounts created the way POST /accounts creates them: plan limit + crypto flag, type investment, balance 0. */
export const createAccountGateway = (
  db: DatabaseFacade,
  connections: ConnectionRepository,
  options: Pick<ConnectionServicesOptions, 'isCryptoEnabled' | 'checkAccountLimit'>,
): AccountGateway => {
  const count = async (workspaceId: string) => {
    const result = await db.query(
      'SELECT COUNT(*)::int AS count FROM accounts WHERE workspace_id = $1',
      [workspaceId],
    );
    return Number(result.rows[0]?.count ?? 0);
  };
  return {
    async listAccounts(workspaceId) {
      const result = await db.query(
        'SELECT id, name, currency, type FROM accounts WHERE workspace_id = $1 ORDER BY name ASC',
        [workspaceId],
      );
      return result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        currency: String(row.currency).toUpperCase(),
        type: row.type,
      }));
    },
    async assertCanAdd(workspaceId, ownerId, adding) {
      if (!options.checkAccountLimit) return;
      const current = await count(workspaceId);
      // checkFeatureLimit refuses when current >= limit; check the last account to be added.
      await options.checkAccountLimit(ownerId, current + adding - 1);
    },
    async usage(workspaceId) {
      const owner = await connections.findOwnerLimits(workspaceId);
      const raw = owner?.limits?.accounts;
      const limit = raw === undefined ? null : Number(raw);
      return {
        used: await count(workspaceId),
        limit: limit === null || !Number.isFinite(limit) || limit < 0 ? null : limit,
      };
    },
    isCryptoEnabled: () =>
      options.isCryptoEnabled ? options.isCryptoEnabled() : Promise.resolve(false),
    async create(trx, input) {
      const service = new AccountService(new AccountRepository(trx));
      const account = await service.createAccount(
        {
          name: input.name,
          type: 'investment',
          balance: 0,
          currency: input.currency,
          color: input.color,
        },
        input.userId,
        input.workspaceId,
      );
      return { id: account.id };
    },
  };
};

export const buildConnectionServices = (db: DatabaseFacade, options: ConnectionServicesOptions) => {
  const registry = options.registry ?? ProviderRegistry.fromConfig(options.config);
  const secretBox = secretBoxFromConfig(options.config);
  const connections = new ConnectionRepository(db);
  const links = new ConnectionAccountRepository(db);
  const transactions = new TransactionRepository(db, options.cache);
  const balances = new TransactionService(transactions, new AccountRepository(db), db);
  const recomputeBalance = (accountId: string, trx: DatabaseFacade) =>
    balances.recomputeAccountBalance(accountId, trx);

  // The interval comes from ConnectionService (plan limits); wired after both exist.
  let service: ConnectionService | null = null;
  const sync = new ConnectionSyncService({
    db,
    connections,
    links,
    transactions,
    recomputeBalance,
    registry,
    secretBox:
      secretBox ??
      SecretBox.fromConfig(
        // Without keys nothing can be connected, so nothing is ever decrypted;
        // a throwaway key keeps the type simple.
        `1:${Buffer.alloc(32).toString('base64')}`,
      ),
    syncIntervalMinutes: (workspaceId) => service!.syncIntervalMinutes(workspaceId),
    activity: options.activity,
  });
  service = new ConnectionService({
    db,
    connections,
    links,
    transactions,
    recomputeBalance,
    registry,
    secretBox,
    sync,
    accounts: options.accounts ?? createAccountGateway(db, connections, options),
    activity: options.activity,
  });
  return { service, sync, registry, secretBox, connections, links };
};
