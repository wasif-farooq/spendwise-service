import { HttpClient, HttpClientOptions } from './http';
import type { ChainAdapterFactory, ConnectionsConfig } from './crypto/types';
import { CHAIN_ADAPTERS } from './crypto/chains';
import { CryptoWalletProvider } from './crypto/CryptoWalletProvider';
import { StripeProvider } from './stripe/StripeProvider';
import type {
  ChainInfo,
  ConnectionKind,
  ConnectionProvider,
  ProviderAuth,
  ProviderId,
} from './types';

/** What GET /connections/providers returns for each source. */
export interface ProviderInfo {
  id: ProviderId;
  kind: ConnectionKind;
  auth: ProviderAuth;
  name: string;
  description: string;
  available: boolean;
  comingSoon: boolean;
  requiresPaidPlan: boolean;
  chains: ChainInfo[];
}

/** Sources announced in the apps until their provider ships and is configured. */
const COMING_SOON: ProviderInfo[] = [
  {
    id: 'stripe',
    kind: 'payment',
    auth: 'oauth',
    name: 'Stripe',
    description: 'Balance, charges and payouts',
    available: false,
    comingSoon: true,
    requiresPaidPlan: true,
    chains: [],
  },
  {
    id: 'paypal',
    kind: 'payment',
    auth: 'oauth',
    name: 'PayPal',
    description: 'Balance and transactions',
    available: false,
    comingSoon: true,
    requiresPaidPlan: true,
    chains: [],
  },
];

export class ProviderRegistry {
  private readonly providers = new Map<ProviderId, ConnectionProvider>();

  constructor(providers: ConnectionProvider[] = []) {
    for (const provider of providers) this.register(provider);
  }

  register(provider: ConnectionProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): ConnectionProvider | undefined {
    return this.providers.get(id as ProviderId);
  }

  list(): ConnectionProvider[] {
    return [...this.providers.values()];
  }

  /** Every source, registered or announced, for the apps' picker. */
  describe(): ProviderInfo[] {
    const registered: ProviderInfo[] = this.list().map((p) => ({
      id: p.id,
      kind: p.kind,
      auth: p.auth,
      name: p.name,
      description: p.description,
      available: p.isAvailable().available,
      comingSoon: false,
      requiresPaidPlan: p.kind === 'payment',
      chains: p.chains().filter((c) => c.available || !c.requiresPaidKey),
    }));
    const missing = COMING_SOON.filter((info) => !this.providers.has(info.id));
    return [...registered, ...missing];
  }

  /**
   * The registry the API and the CLI use: one wallet provider per chain adapter,
   * plus Stripe once its app is configured (it stays "coming soon" until then).
   */
  static fromConfig(
    config: ConnectionsConfig,
    options: {
      adapters?: readonly ChainAdapterFactory[];
      makeHttp?: (options: HttpClientOptions) => HttpClient;
    } = {},
  ): ProviderRegistry {
    const makeHttp = options.makeHttp ?? ((o: HttpClientOptions) => new HttpClient(o));
    const registry = new ProviderRegistry();
    for (const factory of options.adapters ?? CHAIN_ADAPTERS) {
      registry.register(new CryptoWalletProvider(factory({ config, makeHttp })));
    }
    if (StripeProvider.isConfigured(config.stripe)) {
      registry.register(new StripeProvider(config.stripe!, makeHttp, config.httpTimeoutMs));
    }
    return registry;
  }
}
