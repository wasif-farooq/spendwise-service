import { isFiat } from '@domains/currencies/currencies';
import { AuthRevokedError, InvalidAddressError, ProviderDownError, ProviderError } from '../errors';
import { HttpClient, HttpClientOptions, HttpStatusError } from '../http';
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

/**
 * PayPal, read-only: Log in with PayPal for consent, then the Transaction
 * Search API (https://developer.paypal.com/docs/api/transaction-search/v1/).
 *
 * Reading another account's transactions needs PayPal's partner approval. Until
 * the app has it only sandbox accounts work, so leave PAYPAL_* unset (PayPal
 * then stays "coming soon") or point PAYPAL_ENV at the sandbox.
 *
 * One asset per balance currency (`paypal:usd`); the balance is PayPal's total
 * (available + withheld). History is read oldest first in windows of at most
 * 31 days (PayPal's limit), back to three years (also PayPal's limit). A
 * movement can take three hours to show up, so once a link has caught up every
 * run starts three hours before the last one ended; duplicates are dropped by
 * (link, external id). Each movement is imported at its gross amount, its fee
 * as a separate `<id>:fee` row.
 *
 * Tokens: the access token lives for about eight hours and is renewed with the
 * refresh token; both are stored encrypted, as one JSON string.
 */

export interface PayPalConfig {
  clientId?: string;
  clientSecret?: string;
  /** Must be one of the app's return URLs. */
  redirectUri?: string;
  /** 'live' or 'sandbox' (the default: nothing live works before partner approval). */
  environment?: string;
}

const HOSTS = {
  live: { web: 'https://www.paypal.com', api: 'https://api-m.paypal.com' },
  sandbox: { web: 'https://www.sandbox.paypal.com', api: 'https://api-m.sandbox.paypal.com' },
};

export const PAYPAL_SCOPES = [
  'openid',
  'https://uri.paypal.com/services/reporting/search/read',
  'https://uri.paypal.com/services/reporting/balances/read',
];

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
/** PayPal's maximum range for one transactions request. */
export const PAYPAL_WINDOW_MS = 31 * DAY_MS;
/** PayPal serves the previous three years. */
export const PAYPAL_HISTORY_MS = (3 * 365 - 1) * DAY_MS;
/** Executed transactions can take this long to appear. */
export const PAYPAL_OVERLAP_MS = 3 * HOUR_MS;
/** A window PayPal still calls too large below this size is given up on. */
const MIN_WINDOW_MS = 60_000;
const PAGE_SIZE = 500;
/**
 * Requests one run may make for one link. The engine's page limit counts pages
 * that carried movements; empty windows are cheap, and three years of history
 * is 36 of them.
 */
const MAX_REQUESTS_PER_RUN = 40;
const DEFAULT_TOKEN_TTL_S = 8 * 60 * 60;
const REFRESH_MARGIN_MS = 10 * 60_000;

export interface PayPalCredentials {
  v: 1;
  accountId: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

export const readPayPalCredentials = (raw: string): PayPalCredentials => {
  try {
    const c = JSON.parse(raw) as Partial<PayPalCredentials>;
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
  throw new AuthRevokedError('This PayPal connection has no usable sign-in. Reconnect it.');
};

/** What a link stores as its provider cursor. */
export interface PayPalCursor {
  /** Start of the window being read (ISO). */
  from: string;
  /** Its end, fixed while its pages are being read. */
  to?: string;
  /** Next page of that window (1-based). */
  page: number;
}

const readCursor = (raw: unknown): PayPalCursor | null => {
  const c = (raw ?? {}) as Partial<PayPalCursor>;
  if (typeof c.from !== 'string' || Number.isNaN(Date.parse(c.from))) return null;
  return {
    from: c.from,
    to: typeof c.to === 'string' && !Number.isNaN(Date.parse(c.to)) ? c.to : undefined,
    page: Number.isInteger(c.page) && (c.page as number) > 0 ? (c.page as number) : 1,
  };
};

interface Money {
  currency_code?: string;
  value?: string;
}

interface TransactionInfo {
  transaction_id?: string;
  transaction_event_code?: string;
  transaction_initiation_date?: string;
  transaction_amount?: Money;
  fee_amount?: Money;
  transaction_status?: string;
  transaction_subject?: string;
  transaction_note?: string;
}

interface BalanceDetail {
  currency?: string;
  total_balance?: Money;
}

interface BalancesResponse {
  balances?: BalanceDetail[];
  account_id?: string;
}

/** By the first three characters of the transaction event code. */
const EVENT_LABELS: Record<string, string> = {
  T00: 'PayPal payment',
  T01: 'PayPal fee',
  T02: 'Currency conversion',
  T03: 'Transfer from bank',
  T04: 'Withdrawal to bank',
  T05: 'Debit card',
  T06: 'Credit card withdrawal',
  T07: 'Credit card deposit',
  T08: 'Bonus',
  T09: 'Incentive',
  T10: 'Bill payment',
  T11: 'Reversal',
  T12: 'Adjustment',
  T13: 'Authorization',
  T14: 'Dividend',
  T15: 'Hold',
  T17: 'Withdrawal',
  T19: 'Account correction',
  T20: 'Transfer',
  T21: 'Reserve or hold',
  T22: 'Transfer',
};

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** PayPal writes offsets as +0000; Date wants +00:00. */
const parseDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const time = Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(time) ? null : new Date(time);
};

const unsigned = (value: string) => (value.startsWith('-') ? value.slice(1) : value);
const isZero = (value: string) => /^-?0+(\.0+)?$/.test(value);

const shortAccount = (accountId: string) =>
  accountId.length > 8 ? `${accountId.slice(0, 4)}…${accountId.slice(-4)}` : accountId;

export class PayPalProvider implements ConnectionProvider {
  readonly id = 'paypal' as const;
  readonly kind = 'payment' as const;
  readonly auth = 'oauth' as const;
  readonly name = 'PayPal';
  readonly description = 'Balance and transactions';

  private readonly api: HttpClient;
  /** No retries: an authorization code works once. */
  private readonly tokens: HttpClient;
  private readonly hosts: { web: string; api: string };

  readonly oauth: ProviderOAuth = {
    authorizeUrl: (state) => this.authorizeUrl(state),
    exchangeCode: (code, now) => this.exchangeCode(code, now),
    refresh: (credentials, now) => this.refresh(credentials, now),
  };

  constructor(
    private readonly config: PayPalConfig,
    makeHttp: (options: HttpClientOptions) => HttpClient,
    timeoutMs?: number,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.hosts = config.environment === 'live' ? HOSTS.live : HOSTS.sandbox;
    this.api = makeHttp({ name: 'PayPal', timeoutMs, maxPerSecond: 5 });
    this.tokens = makeHttp({ name: 'PayPal', timeoutMs, retries: 0 });
  }

  /** Whether the operator has set the app up (the registry lists PayPal as coming soon until then). */
  static isConfigured(config: PayPalConfig | undefined): boolean {
    return Boolean(config?.clientId && config?.clientSecret && config?.redirectUri);
  }

  isAvailable(): Availability {
    return PayPalProvider.isConfigured(this.config)
      ? { available: true }
      : { available: false, reason: 'The PayPal app is not configured (PAYPAL_*).' };
  }

  chains() {
    return [];
  }

  validate(): ValidatedInput {
    throw new InvalidAddressError('PayPal is connected by signing in to PayPal.');
  }

  // ----- OAuth -----

  private authorizeUrl(state: string): string {
    const url = new URL(`${this.hosts.web}/connect`);
    url.searchParams.set('flowEntry', 'static');
    url.searchParams.set('client_id', this.config.clientId ?? '');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', PAYPAL_SCOPES.join(' '));
    url.searchParams.set('redirect_uri', this.config.redirectUri ?? '');
    url.searchParams.set('state', state);
    return url.toString();
  }

  private basicAuth(): Record<string, string> {
    const token = Buffer.from(
      `${this.config.clientId ?? ''}:${this.config.clientSecret ?? ''}`,
    ).toString('base64');
    return { Authorization: `Basic ${token}` };
  }

  private async token(
    params: Record<string, string>,
    now: Date,
  ): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: number }> {
    const body = await this.tokens.postForm<any>(
      `${this.hosts.api}/v1/oauth2/token`,
      params,
      this.basicAuth(),
    );
    if (!body?.access_token) throw new ProviderDownError('PayPal answered without a token.');
    const ttl = Number(body.expires_in) > 0 ? Number(body.expires_in) : DEFAULT_TOKEN_TTL_S;
    return {
      accessToken: String(body.access_token),
      refreshToken: body.refresh_token ? String(body.refresh_token) : null,
      expiresAt: now.getTime() + ttl * 1000,
    };
  }

  private async exchangeCode(code: string, now: Date): Promise<OAuthGrant> {
    const refused = new ProviderError(
      'UNKNOWN',
      'PayPal did not accept the sign-in. Start the connection again.',
    );
    let issued;
    try {
      issued = await this.token({ grant_type: 'authorization_code', code }, now);
    } catch (error) {
      if (error instanceof HttpStatusError) throw refused;
      throw error;
    }
    if (!issued.refreshToken) throw refused;
    const credentials: PayPalCredentials = {
      v: 1,
      accountId: '',
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      expiresAt: issued.expiresAt,
    };
    credentials.accountId = await this.accountId(JSON.stringify(credentials));
    return {
      accountRef: credentials.accountId,
      credentials: JSON.stringify(credentials),
      displayName: 'PayPal account',
      metadata: { addressHint: shortAccount(credentials.accountId) },
    };
  }

  /** The PayPal account id: the balances report carries it; the profile is the fallback. */
  private async accountId(credentials: string): Promise<string> {
    const conn = { id: '', address: credentials, metadata: {} };
    try {
      const balances = await this.get<BalancesResponse>(
        conn,
        '/v1/reporting/balances?currency_code=ALL',
      );
      if (balances?.account_id) return String(balances.account_id);
      const profile = await this.get<{ user_id?: string }>(
        conn,
        '/v1/identity/openidconnect/userinfo?schema=openid',
      );
      if (profile?.user_id) return String(profile.user_id);
    } catch (error) {
      if (error instanceof HttpStatusError) {
        throw new ProviderDownError(`PayPal answered ${error.status}`, error.status);
      }
      throw error;
    }
    throw new ProviderDownError('PayPal did not say which account this is.');
  }

  private async refresh(raw: string, now: Date): Promise<string | null> {
    const current = readPayPalCredentials(raw);
    if (current.expiresAt - now.getTime() > REFRESH_MARGIN_MS) return null;
    try {
      const next = await this.token(
        { grant_type: 'refresh_token', refresh_token: current.refreshToken },
        now,
      );
      const rolled: PayPalCredentials = {
        ...current,
        accessToken: next.accessToken,
        // PayPal usually keeps the same refresh token.
        refreshToken: next.refreshToken ?? current.refreshToken,
        expiresAt: next.expiresAt,
      };
      return JSON.stringify(rolled);
    } catch (error) {
      // Consent was withdrawn, or the refresh token expired.
      if (error instanceof HttpStatusError) throw new AuthRevokedError();
      throw error;
    }
  }

  // ----- reading -----

  private async get<T>(conn: ProviderConnection, path: string): Promise<T> {
    const { accessToken } = readPayPalCredentials(conn.address);
    try {
      return await this.api.getJson<T>(`${this.hosts.api}${path}`, {
        Authorization: `Bearer ${accessToken}`,
      });
    } catch (error) {
      if (error instanceof HttpStatusError) {
        if (error.status === 401) throw new AuthRevokedError();
        if (error.status === 403) {
          // NOT_AUTHORIZED: the app isn't approved to read this account's reports.
          throw new ProviderDownError("PayPal refused access to this account's transactions.", 403);
        }
      }
      throw error;
    }
  }

  private async balances(conn: ProviderConnection, currency: string): Promise<BalanceDetail[]> {
    try {
      const body = await this.get<BalancesResponse>(
        conn,
        `/v1/reporting/balances?currency_code=${encodeURIComponent(currency)}`,
      );
      return body?.balances ?? [];
    } catch (error) {
      if (error instanceof HttpStatusError) {
        throw new ProviderDownError(`PayPal answered ${error.status}`, error.status);
      }
      throw error;
    }
  }

  async discoverAssets(conn: ProviderConnection): Promise<DiscoveredAsset[]> {
    const balances = await this.balances(conn, 'ALL');
    return balances
      .filter((b) => b.currency)
      .map((b) => {
        const code = String(b.currency).toUpperCase();
        const supported = isFiat(code);
        const value = String(b.total_balance?.value ?? '0');
        return {
          assetKey: `paypal:${code.toLowerCase()}`,
          chainId: null,
          chainName: this.name,
          symbol: code,
          name: `${code} balance`,
          currencyCode: supported ? code : null,
          balance: DECIMAL_RE.test(value) ? value : '0',
          supported,
        };
      })
      .sort((a, b) => a.assetKey.localeCompare(b.assetKey));
  }

  describeAsset(assetKey: string): AssetDescription | null {
    const match = /^paypal:([a-z]{3})$/.exec(assetKey);
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
    const code = link.currencyCode.toUpperCase();
    const balances = await this.balances(conn, code);
    const value = balances.find((b) => String(b.currency).toUpperCase() === code)?.total_balance
      ?.value;
    return value && DECIMAL_RE.test(value) ? value : '0';
  }

  async fetchTransactions(
    conn: ProviderConnection,
    link: ProviderLink,
    cursor: unknown,
    options: FetchOptions,
  ): Promise<FetchResult> {
    const now = this.now();
    const floor = now.getTime() - PAYPAL_HISTORY_MS;
    const start = new Date(Math.max(options.since ? options.since.getTime() : floor, floor));
    const saved = readCursor(cursor);
    let from = saved ? new Date(Math.max(Date.parse(saved.from), floor)) : start;
    let to = saved?.to ? new Date(saved.to) : null;
    let page = saved?.page ?? 1;
    let span = PAYPAL_WINDOW_MS;

    const items: NormalizedTxn[] = [];
    let pages = 0;
    let requests = 0;
    let caughtUp = false;

    while (
      pages < options.maxPages &&
      requests < MAX_REQUESTS_PER_RUN &&
      items.length < options.maxRows
    ) {
      const end = to ?? new Date(Math.min(from.getTime() + span, now.getTime()));
      if (end.getTime() <= from.getTime()) {
        caughtUp = true;
        break;
      }
      requests++;
      let body;
      try {
        body = await this.window(conn, link.currencyCode, from, end, page);
      } catch (error) {
        if (page === 1 && isTooLarge(error) && end.getTime() - from.getTime() > MIN_WINDOW_MS) {
          // More than PayPal lists for one range: read this stretch in smaller windows.
          span = Math.floor((end.getTime() - from.getTime()) / 2);
          to = null;
          continue;
        }
        if (error instanceof HttpStatusError) {
          throw new ProviderDownError(`PayPal answered ${error.status}`, error.status);
        }
        throw error;
      }
      if ((body?.transaction_details ?? []).length > 0) pages++;
      for (const detail of body?.transaction_details ?? []) {
        items.push(
          ...this.toRows(detail?.transaction_info ?? {}, link.currencyCode, options.since),
        );
      }
      if (page < Number(body?.total_pages ?? 1)) {
        page++;
        to = end;
        continue;
      }
      // This window is done.
      page = 1;
      to = null;
      from = end;
      if (end.getTime() >= now.getTime()) {
        caughtUp = true;
        break;
      }
    }

    if (caughtUp) {
      return { items, nextCursor: this.liveCursor(now, start), hasMore: false };
    }
    const next: PayPalCursor = { from: from.toISOString(), page };
    if (to) next.to = to.toISOString();
    return { items, nextCursor: next, hasMore: true };
  }

  /** Where a caught-up link resumes: a little before now, for PayPal's reporting delay. */
  private liveCursor(now: Date, start: Date): PayPalCursor {
    const from = Math.max(now.getTime() - PAYPAL_OVERLAP_MS, start.getTime());
    return { from: new Date(from).toISOString(), page: 1 };
  }

  private window(conn: ProviderConnection, currency: string, from: Date, to: Date, page: number) {
    const query = new URLSearchParams({
      start_date: from.toISOString(),
      end_date: to.toISOString(),
      transaction_currency: currency.toUpperCase(),
      fields: 'transaction_info',
      balance_affecting_records_only: 'Y',
      page_size: String(PAGE_SIZE),
      page: String(page),
    });
    return this.get<{
      transaction_details?: Array<{ transaction_info?: TransactionInfo }>;
      total_pages?: number;
    }>(conn, `/v1/reporting/transactions?${query.toString()}`);
  }

  /** The gross movement, plus the fee as its own row. Denied transactions never moved money. */
  private toRows(info: TransactionInfo, currency: string, since: Date | null): NormalizedTxn[] {
    const date = parseDate(info.transaction_initiation_date);
    const amount = String(info.transaction_amount?.value ?? '');
    if (!info.transaction_id || !date || !DECIMAL_RE.test(amount)) return [];
    if (info.transaction_status === 'D') return [];
    if (since && date < since) return [];
    const code = String(info.transaction_amount?.currency_code ?? currency).toUpperCase();
    if (code !== currency.toUpperCase()) return [];

    const event = info.transaction_event_code ?? '';
    // One PayPal id can cover more than one event (a payment and its conversion).
    const externalId = event ? `${info.transaction_id}:${event}` : info.transaction_id;
    const description =
      (info.transaction_subject ?? '').trim() ||
      (info.transaction_note ?? '').trim() ||
      EVENT_LABELS[event.slice(0, 3)] ||
      'PayPal transaction';

    const rows: NormalizedTxn[] = [];
    if (!isZero(amount)) {
      rows.push({
        externalId,
        date,
        type: amount.startsWith('-') ? 'expense' : 'income',
        amount: unsigned(amount),
        description,
      });
    }
    const fee = String(info.fee_amount?.value ?? '');
    if (DECIMAL_RE.test(fee) && !isZero(fee)) {
      // PayPal reports a fee it took as a negative amount.
      const charged = fee.startsWith('-');
      rows.push({
        externalId: `${externalId}:fee`,
        date,
        type: charged ? 'expense' : 'income',
        amount: unsigned(fee),
        description: charged ? 'PayPal fee' : 'PayPal fee refund',
        isFee: true,
      });
    }
    return rows;
  }

  /** Drops the rest of the backfill: the link continues from now. */
  async skipBackfill(): Promise<PayPalCursor> {
    const now = this.now();
    return this.liveCursor(now, new Date(now.getTime() - PAYPAL_OVERLAP_MS));
  }
}

const isTooLarge = (error: unknown): boolean =>
  error instanceof HttpStatusError &&
  error.status === 400 &&
  error.body.includes('RESULTSET_TOO_LARGE');
