import { InvalidAddressError } from '../errors';
import type {
  AssetDescription,
  ConnectionProvider,
  ProviderConnection,
  ValidatedInput,
} from '../types';
import { assetKeyOf, evmChainName, findCuratedAsset, parseAssetKey, shortAddress } from './assets';
import type { ChainAdapter } from './types';

/** Wraps a chain adapter into the generic provider contract (auth by public address). */
export class CryptoWalletProvider implements ConnectionProvider {
  readonly kind = 'crypto_wallet' as const;
  readonly auth = 'address' as const;

  constructor(private readonly adapter: ChainAdapter) {}

  get id() {
    return this.adapter.providerId;
  }
  get name() {
    return this.adapter.name;
  }
  get description() {
    return this.adapter.description;
  }

  isAvailable() {
    return this.adapter.isAvailable();
  }

  chains() {
    return this.adapter.chains();
  }

  validate(input: { address: string; chains?: string[] }): ValidatedInput {
    const address = this.adapter.normalizeAddress(String(input.address ?? ''));
    if (!address) throw new InvalidAddressError();
    const offered = this.adapter.chains().map((c) => c.id);
    let chains = (input.chains ?? []).filter((id) => offered.includes(id));
    if (this.adapter.family !== 'evm') chains = [];
    else if (chains.length === 0) chains = offered.slice(0, 1);
    return {
      address,
      metadata: { addressHint: shortAddress(address), chains, family: this.adapter.family },
    };
  }

  discoverAssets(conn: ProviderConnection) {
    return this.adapter.discoverAssets(conn.address, conn.metadata?.chains ?? []);
  }

  describeAsset(assetKey: string): AssetDescription | null {
    const parsed = parseAssetKey(assetKey);
    if (!parsed || parsed.family !== this.adapter.family) return null;
    const asset = findCuratedAsset(parsed.family, parsed.chainId, parsed.contract);
    if (!asset) return null;
    const chainName =
      parsed.family === 'evm'
        ? evmChainName(parsed.chainId)
        : (this.adapter.chains()[0]?.name ?? this.adapter.name);
    return {
      assetKey: assetKeyOf(parsed.family, parsed.chainId, parsed.contract),
      chainId: parsed.chainId,
      chainName,
      symbol: asset.symbol,
      name: asset.name,
      currencyCode: asset.currencyCode,
    };
  }

  fetchBalance(conn: ProviderConnection, link: Parameters<ChainAdapter['fetchBalance']>[1]) {
    return this.adapter.fetchBalance(conn.address, link);
  }

  fetchTransactions(
    conn: ProviderConnection,
    link: Parameters<ChainAdapter['fetchTransactions']>[1],
    cursor: unknown,
    options: Parameters<ChainAdapter['fetchTransactions']>[3],
  ) {
    return this.adapter.fetchTransactions(conn.address, link, cursor, options);
  }

  skipBackfill(
    conn: ProviderConnection,
    link: Parameters<ChainAdapter['skipBackfill']>[1],
    cursor: unknown,
  ) {
    return this.adapter.skipBackfill(conn.address, link, cursor);
  }
}
