import { InvalidAddressError } from '../errors';
import type { ConnectionProvider, ProviderConnection, ValidatedInput } from '../types';
import { shortAddress } from './assets';
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
}
