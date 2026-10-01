/**
 * The provider contract. A provider is one kind of source (one chain family,
 * later Stripe or PayPal). The framework (ConnectionService, the sync engine)
 * only talks to this interface, so a new source is a new provider plus one
 * registry line.
 */

export type ProviderId =
  | 'crypto:evm'
  | 'crypto:bitcoin'
  | 'crypto:tron'
  | 'crypto:solana'
  | 'stripe'
  | 'paypal';

export const PROVIDER_IDS: readonly ProviderId[] = [
  'crypto:evm',
  'crypto:bitcoin',
  'crypto:tron',
  'crypto:solana',
  'stripe',
  'paypal',
];

export type ConnectionKind = 'crypto_wallet' | 'payment';
export type ProviderAuth = 'address' | 'oauth';
export type SyncMode = 'history' | 'from_today';

/** A network a provider can read, e.g. Polygon for EVM. */
export interface ChainInfo {
  id: string;
  name: string;
  nativeCurrency: string;
  available: boolean;
  /** Hidden unless the operator's key covers it (Etherscan paid tier). */
  requiresPaidKey?: boolean;
}

export interface Availability {
  available: boolean;
  /** Why not, for the operator (never shown with secrets). */
  reason?: string;
}

/** The decrypted connection, as the provider sees it. */
export interface ProviderConnection {
  id: string;
  /** Normalised address (or account id). Never log it in full. */
  address: string;
  metadata: Record<string, any>;
}

/** One linked asset, as the provider sees it. */
export interface ProviderLink {
  id: string;
  assetKey: string;
  chainId: string | null;
  currencyCode: string;
}

export interface AssetDescription {
  assetKey: string;
  chainId: string | null;
  chainName: string;
  symbol: string;
  name: string;
  currencyCode: string;
}

export interface DiscoveredAsset {
  /** Stable key, e.g. `evm:137:0x2791…`, `btc:native`. */
  assetKey: string;
  chainId: string | null;
  chainName: string;
  symbol: string;
  name: string;
  /** The ledger currency it maps to; null when unsupported. */
  currencyCode: string | null;
  /** Exact decimal string. */
  balance: string;
  /** Unsupported tokens are shown greyed out and never imported. */
  supported: boolean;
}

/**
 * One movement on a linked asset. Fees are their own rows (`<txid>:fee`),
 * always expenses.
 */
export interface NormalizedTxn {
  externalId: string;
  date: Date;
  type: 'income' | 'expense';
  /** Exact positive decimal string. */
  amount: string;
  description: string;
  counterparty?: string;
  isFee?: boolean;
}

export interface FetchResult {
  items: NormalizedTxn[];
  /** Opaque, stored on the link (JSONB) and handed back next time. */
  nextCursor: unknown;
  /** More pages are waiting; the next run continues from nextCursor. */
  hasMore: boolean;
}

export interface FetchOptions {
  /** Ignore movements older than this (history start, or now for from_today). */
  since: Date | null;
  maxPages: number;
  maxRows: number;
}

export interface ValidatedInput {
  /** Normalised address (or account id). */
  address: string;
  /** Plain metadata kept on the connection (chains to check, a short address hint). */
  metadata: Record<string, any>;
}

export interface ConnectionProvider {
  id: ProviderId;
  kind: ConnectionKind;
  auth: ProviderAuth;
  name: string;
  description: string;
  isAvailable(): Availability;
  /** Networks the user can pick (EVM) or the one network it reads. */
  chains(): ChainInfo[];
  /** Throws InvalidAddressError. */
  validate(input: { address: string; chains?: string[] }): ValidatedInput;
  discoverAssets(conn: ProviderConnection): Promise<DiscoveredAsset[]>;
  /** What an asset key means (currency, chain), or null when it isn't supported. */
  describeAsset(assetKey: string): AssetDescription | null;
  /** Exact decimal string. */
  fetchBalance(conn: ProviderConnection, link: ProviderLink): Promise<string>;
  fetchTransactions(
    conn: ProviderConnection,
    link: ProviderLink,
    cursor: unknown,
    options: FetchOptions,
  ): Promise<FetchResult>;
  /**
   * A cursor that continues from now, dropping an unfinished backfill (the
   * first import hit its cap; the opening balance covers what's older).
   */
  skipBackfill(conn: ProviderConnection, link: ProviderLink, cursor: unknown): Promise<unknown>;
}
