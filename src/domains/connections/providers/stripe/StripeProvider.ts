import { isFiat } from '@domains/currencies/currencies';
import { AuthRevokedError, InvalidAddressError, ProviderDownError, ProviderError } from '../errors';
import { HttpClient, HttpClientOptions, HttpStatusError } from '../http';
import { pageNewestFirst, skipNewestFirstBackfill } from '../crypto/newestFirst';
import type {
  AssetDescription,
  Availability,
  ConnectionProvider,
  DiscoveredAsset,
  FetchOptions,
  FetchResult,
  NormalizedTxn,
  OAuthGrant,
  ProviderConnection,
  ProviderLink,
  ProviderOAuth,
  ValidatedInput,
} from '../types';
import { stripeAmount } from './money';

/**
 * Stripe, read-only, through a Stripe App installed with OAuth
 * (https://docs.stripe.com/stripe-apps/api-authentication/oauth). Stripe
 * reserves read-only OAuth for apps: a plain Connect platform only gets
 * read_write, which this feature must not hold.
 *
 * The app manifest needs two permissions: balance_read and
 * balance_transaction_source_read. A 403 from Stripe (a permission is missing)
 * is reported as REAUTH_REQUIRED.
 *
 * One asset per balance currency (`stripe:usd`). The balance is available +
 * pending, which is what the balance transactions add up to. Each balance
 * transaction is imported at its gross amount, with its fee as a separate
 * `<id>:fee` expense, so a row pair nets to what Stripe moved.
 *
 * Tokens: the access token lives for an hour, the refresh token for a year and
 * is rolled on every use, so the new pair must be stored each time (the sync
 * engine does, under a row lock). They are kept encrypted, as one JSON string.
 */

export interface StripeConfig {
  /** The Stripe App's OAuth client id (ca_…). */
  clientId?: string;
  /** The app developer account's secret key; exchanges and refreshes tokens. */
  secretKey?: string;
  /** The install link; the external-test link until the app is published. */
  authorizeUrl?: string;
  /** Must be one of the app manifest's allowed_redirect_uris. */
  redirectUri?: string;
  apiBaseUrl?: string;
}

export const STRIPE_AUTHORIZE_URL = 'https://marketplace.stripe.com/oauth/v2/authorize';
export const STRIPE_API_BASE_URL = 'https://api.stripe.com';

/** Stripe doesn't return a lifetime; access tokens expire after an hour. */
const ACCESS_TOKEN_TTL_MS = 55 * 60_000;
/** Roll the tokens when the access token has less than this left. */
const REFRESH_MARGIN_MS = 10 * 60_000;
const PAGE_SIZE = 100;

export interface StripeCredentials {
  v: 1;
  accountId: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

export const readStripeCredentials = (raw: string): StripeCredentials => {
  try {
    const c = JSON.parse(raw) as Partial<StripeCredentials>;
    if (c && typeof c.accessToken === 'string' && typeof c.refreshToken === 'string') {
      return {
        v: 1,
        accountId: String(c.accountId ?? ''),
        accessToken: c.accessToken,
        refreshToken: c.refreshToken,
        expiresAt: Number(c.expiresAt) || 0,
      };
    }
  } catch {
    // fall through
  }
  throw new AuthRevokedError('This Stripe connection has no usable sign-in. Reconnect it.');
};

interface BalanceAmount {
  amount: number;
  currency: string;
}

interface BalanceTransaction {
  id: string;
  amount: number;
  fee: number;
  currency: string;
  created: number;
  type: string;
  description: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  charge: 'Stripe payment',
  payment: 'Stripe payment',
  refund: 'Refund',
  payment_refund: 'Refund',
  payout: 'Payout to bank',
  payout_cancel: 'Payout cancelled',
  payout_failure: 'Payout failed',
  stripe_fee: 'Stripe fee',
  application_fee: 'Application fee',
  transfer: 'Transfer',
  adjustment: 'Adjustment',
  topup: 'Top-up',
};

const describe = (txn: BalanceTransaction): string => {
  // Payouts read the same everywhere, whatever the statement descriptor says.
  if (txn.type === 'payout') return TYPE_LABELS.payout;
  const text = (txn.description ?? '').trim();
  if (text) return text;
  return TYPE_LABELS[txn.type] ?? `Stripe ${txn.type.replace(/_/g, ' ')}`;
};

const shortAccount = (accountId: string) =>
  accountId.length > 12 ? `${accountId.slice(0, 8)}…${accountId.slice(-4)}` : accountId;

export class StripeProvider implements ConnectionProvider {
  readonly id = 'stripe' as const;
  readonly kind = 'payment' as const;
  readonly auth = 'oauth' as const;
  readonly name = 'Stripe';
  readonly description = 'Balance, charges and payouts';

  private readonly api: HttpClient;
  /** No retries: an authorization code or a refresh token can be used once. */
  private readonly tokens: HttpClient;
  private readonly base: string;

  readonly oauth: ProviderOAuth = {
    authorizeUrl: (state) => this.authorizeUrl(state),
    exchangeCode: (code, now) => this.exchangeCode(code, now),
    refresh: (credentials, now) => this.refresh(credentials, now),
  };

  constructor(
    private readonly config: StripeConfig,
    makeHttp: (options: HttpClientOptions) => HttpClient,
    timeoutMs?: number,
  ) {
    this.base = (config.apiBaseUrl || STRIPE_API_BASE_URL).replace(/\/+$/, '');
    this.api = makeHttp({ name: 'Stripe', timeoutMs, maxPerSecond: 20 });
    this.tokens = makeHttp({ name: 'Stripe', timeoutMs, retries: 0 });
  }

  /** Whether the operator has set the app up (the registry lists Stripe as coming soon until then). */
  static isConfigured(config: StripeConfig | undefined): boolean {
    return Boolean(config?.clientId && config?.secretKey && config?.redirectUri);
  }

  isAvailable(): Availability {
    return StripeProvider.isConfigured(this.config)
      ? { available: true }
      : { available: false, reason: 'The Stripe app is not configured (STRIPE_APP_*).' };
  }

  chains() {
    return [];
  }

  validate(): ValidatedInput {
    throw new InvalidAddressError('Stripe is connected by signing in to Stripe.');
  }

  // ----- OAuth -----

  private authorizeUrl(state: string): string {
    const url = new URL(this.config.authorizeUrl || STRIPE_AUTHORIZE_URL);
    url.searchParams.set('client_id', this.config.clientId ?? '');
    url.searchParams.set('redirect_uri', this.config.redirectUri ?? '');
    url.searchParams.set('state', state);
    return url.toString();
  }

  private basicAuth(): Record<string, string> {
    const token = Buffer.from(`${this.config.secretKey ?? ''}:`).toString('base64');
    return { Authorization: `Basic ${token}` };
  }

  private async token(params: Record<string, string>, now: Date): Promise<StripeCredentials> {
    const body = await this.tokens.postForm<any>(
      `${this.base}/v1/oauth/token`,
      params,
      this.basicAuth(),
    );
    if (!body?.access_token || !body?.refresh_token || !body?.stripe_user_id) {
      throw new ProviderDownError('Stripe answered without tokens.');
    }
    return {
      v: 1,
      accountId: String(body.stripe_user_id),
      accessToken: String(body.access_token),
      refreshToken: String(body.refresh_token),
      expiresAt: now.getTime() + ACCESS_TOKEN_TTL_MS,
    };
  }

  private async exchangeCode(code: string, now: Date): Promise<OAuthGrant> {
    let credentials: StripeCredentials;
    try {
      credentials = await this.token({ grant_type: 'authorization_code', code }, now);
    } catch (error) {
      if (error instanceof HttpStatusError) {
        // invalid_grant: the code was used, expired, or belongs to another mode.
        throw new ProviderError(
          'UNKNOWN',
          'Stripe did not accept the sign-in. Start the connection again.',
          error.status,
        );
      }
      throw error;
    }
    return {
      accountRef: credentials.accountId,
      credentials: JSON.stringify(credentials),
      displayName: 'Stripe account',
      metadata: { addressHint: shortAccount(credentials.accountId) },
    };
  }

  private async refresh(raw: string, now: Date): Promise<string | null> {
    const current = readStripeCredentials(raw);
    if (current.expiresAt - now.getTime() > REFRESH_MARGIN_MS) return null;
    try {
      const next = await this.token(
        { grant_type: 'refresh_token', refresh_token: current.refreshToken },
        now,
      );
      return JSON.stringify({ ...next, accountId: next.accountId || current.accountId });
    } catch (error) {
      // The app was uninstalled, or the refresh token expired or was already used.
      if (error instanceof HttpStatusError) throw new AuthRevokedError();
      throw error;
    }
  }

  // ----- reading -----

  private async get<T>(conn: ProviderConnection, path: string): Promise<T> {
    const { accessToken } = readStripeCredentials(conn.address);
    try {
      return await this.api.getJson<T>(`${this.base}${path}`, {
        Authorization: `Bearer ${accessToken}`,
      });
    } catch (error) {
      if (error instanceof HttpStatusError) {
        if (error.status === 401) throw new AuthRevokedError();
        if (error.status === 403) {
          throw new ProviderError(
            'REAUTH_REQUIRED',
            'TrackMyPocket is missing a permission on this Stripe account. Reconnect it.',
            403,
          );
        }
        throw new ProviderDownError(`Stripe answered ${error.status}`, error.status);
      }
      throw error;
    }
  }

  /** Available + pending per currency, in the smallest unit. */
  private async balances(conn: ProviderConnection): Promise<Map<string, bigint>> {
    const body = await this.get<{ available?: BalanceAmount[]; pending?: BalanceAmount[] }>(
      conn,
      '/v1/balance',
    );
    const totals = new Map<string, bigint>();
    for (const entry of [...(body?.available ?? []), ...(body?.pending ?? [])]) {
      const currency = String(entry.currency).toLowerCase();
      totals.set(currency, (totals.get(currency) ?? 0n) + BigInt(entry.amount));
    }
    return totals;
  }

  async discoverAssets(conn: ProviderConnection): Promise<DiscoveredAsset[]> {
    const totals = await this.balances(conn);
    return [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => {
        const code = currency.toUpperCase();
        const supported = isFiat(code);
        return {
          assetKey: `stripe:${currency}`,
          chainId: null,
          chainName: this.name,
          symbol: code,
          name: `${code} balance`,
          currencyCode: supported ? code : null,
          balance: stripeAmount(amount, code),
          supported,
        };
      });
  }

  describeAsset(assetKey: string): AssetDescription | null {
    const match = /^stripe:([a-z]{3})$/.exec(assetKey);
    if (!match) return null;
    const code = match[1].toUpperCase();
    if (!isFiat(code)) return null;
    return {
      assetKey,
      chainId: null,
      chainName: this.name,
      symbol: code,
      name: `${code} balance`,
      currencyCode: code,
    };
  }

  async fetchBalance(conn: ProviderConnection, link: ProviderLink): Promise<string> {
    const totals = await this.balances(conn);
    return stripeAmount(totals.get(link.currencyCode.toLowerCase()) ?? 0n, link.currencyCode);
  }

  async fetchTransactions(
    conn: ProviderConnection,
    link: ProviderLink,
    cursor: unknown,
    options: FetchOptions,
  ): Promise<FetchResult> {
    const currency = link.currencyCode.toLowerCase();
    return pageNewestFirst<BalanceTransaction>({
      cursor,
      since: options.since,
      maxPages: options.maxPages,
      maxRows: options.maxRows,
      fetchPage: async (token) => {
        const query = new URLSearchParams({ limit: String(PAGE_SIZE), currency });
        if (token) query.set('starting_after', token);
        const page = await this.get<{ data?: BalanceTransaction[]; has_more?: boolean }>(
          conn,
          `/v1/balance_transactions?${query.toString()}`,
        );
        const items = page?.data ?? [];
        return {
          items,
          next: page?.has_more && items.length > 0 ? items[items.length - 1].id : null,
        };
      },
      idOf: (txn) => txn.id,
      timeOf: (txn) => new Date(txn.created * 1000),
      map: (txn) => this.toRows(txn, link.currencyCode),
    });
  }

  /** The gross movement, plus the fee as its own row. */
  private toRows(txn: BalanceTransaction, currency: string): NormalizedTxn[] {
    const date = new Date(txn.created * 1000);
    const rows: NormalizedTxn[] = [];
    const amount = BigInt(txn.amount ?? 0);
    const fee = BigInt(txn.fee ?? 0);
    if (amount !== 0n) {
      rows.push({
        externalId: txn.id,
        date,
        type: amount > 0n ? 'income' : 'expense',
        amount: stripeAmount(amount < 0n ? -amount : amount, currency),
        description: describe(txn),
      });
    }
    if (fee !== 0n) {
      rows.push({
        externalId: `${txn.id}:fee`,
        date,
        // A negative fee is a fee handed back (e.g. on a refund).
        type: fee > 0n ? 'expense' : 'income',
        amount: stripeAmount(fee < 0n ? -fee : fee, currency),
        description: fee > 0n ? 'Stripe fee' : 'Stripe fee refund',
        isFee: true,
      });
    }
    return rows;
  }

  skipBackfill(_conn: ProviderConnection, _link: ProviderLink, cursor: unknown) {
    return skipNewestFirstBackfill(cursor);
  }
}
