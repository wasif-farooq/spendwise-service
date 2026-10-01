import type { HttpClient, HttpClientOptions } from '../http';
import type {
  Availability,
  ChainInfo,
  DiscoveredAsset,
  FetchOptions,
  FetchResult,
  ProviderId,
  ProviderLink,
} from '../types';
import type { CryptoFamily } from './assets';

/** `connections` in config/environments/*. */
export interface ConnectionsConfig {
  encryption?: { keys?: string; active?: string };
  httpTimeoutMs?: number;
  etherscan?: { baseUrl?: string; apiKey?: string; paidPlan?: boolean };
  bitcoin?: { baseUrl?: string };
  tron?: { baseUrl?: string; apiKey?: string };
  solana?: { rpcUrl?: string };
  syncCron?: { enabled?: boolean; intervalMinutes?: number };
}

export interface ChainAdapterDeps {
  config: ConnectionsConfig;
  makeHttp(options: HttpClientOptions): HttpClient;
}

/**
 * One chain family. The wallet provider wraps it into a ConnectionProvider; a
 * new chain is one adapter file plus one line in chains/index.ts.
 */
export interface ChainAdapter {
  providerId: ProviderId;
  family: CryptoFamily;
  name: string;
  description: string;
  isAvailable(): Availability;
  chains(): ChainInfo[];
  /** The canonical form of an address, or null when it isn't one. */
  normalizeAddress(raw: string): string | null;
  discoverAssets(address: string, chainIds: string[]): Promise<DiscoveredAsset[]>;
  fetchBalance(address: string, link: ProviderLink): Promise<string>;
  fetchTransactions(
    address: string,
    link: ProviderLink,
    cursor: unknown,
    options: FetchOptions,
  ): Promise<FetchResult>;
  /** See ConnectionProvider.skipBackfill. */
  skipBackfill(address: string, link: ProviderLink, cursor: unknown): Promise<unknown>;
}

export type ChainAdapterFactory = (deps: ChainAdapterDeps) => ChainAdapter;
