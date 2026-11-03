import { AuthRevokedError } from '@domains/connections/providers/errors';
import { FetchLike, HttpClient, HttpClientOptions } from '@domains/connections/providers/http';
import { ProviderRegistry } from '@domains/connections/providers/ProviderRegistry';
import {
  PAYPAL_OVERLAP_MS,
  PAYPAL_SCOPES,
  PAYPAL_WINDOW_MS,
  PayPalProvider,
  readPayPalCredentials,
} from '@domains/connections/providers/paypal/PayPalProvider';
import { Store, build } from './fakes';
import { fixture } from './helpers';

/**
 * PayPal (Log in with PayPal + Transaction Search): the provider against the
 * shapes of PayPal's API, then sign-in and a sync through the real services
 * over in-memory repositories.
 */

const WS = 'ws-1';
const NOW = new Date('2026-10-01T12:00:00Z');
const CONFIG = {
  clientId: 'paypal-client',
  clientSecret: 'paypal-secret',
  redirectUri: 'https://app.example/connections/oauth/paypal/callback',
  environment: 'sandbox',
};

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}

const dateOf = (detail: any) =>
  Date.parse(detail.transaction_info.transaction_initiation_date.replace('+0000', 'Z'));

/** A scriptable PayPal: tokens, balances and a transaction list served by date range and page. */
const fakePayPal = (now: () => Date = () => NOW) => {
  const state = {
    calls: [] as Call[],
    balances: fixture('paypal', 'balances.json'),
    transactions: fixture('paypal', 'transactions.json') as any[],
    validTokens: new Set(['at_1']),
    refreshToken: 'rt_1',
    issued: 1,
    codes: new Set(['code_good']),
    pageSize: 500,
    /** A range holding more rows than this answers RESULTSET_TOO_LARGE. */
    maxRowsPerRange: 10_000,
    forbidReports: false,
  };
  const answer = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  });
  const issue = (withRefresh: boolean) => {
    state.issued++;
    const accessToken = `at_${state.issued}`;
    state.validTokens = new Set([accessToken]);
    return answer(200, {
      access_token: accessToken,
      ...(withRefresh ? { refresh_token: state.refreshToken } : {}),
      token_type: 'Bearer',
      expires_in: 28800,
    });
  };
  const fetchImpl: FetchLike = async (url, init) => {
    state.calls.push({ method: init.method, url, headers: init.headers, body: init.body });
    const { pathname, searchParams, host } = new URL(url);
    if (host !== 'api-m.sandbox.paypal.com') throw new Error(`Unexpected host: ${url}`);
    if (pathname === '/v1/oauth2/token') {
      const form = new URLSearchParams(init.body);
      if (form.get('grant_type') === 'authorization_code') {
        return state.codes.delete(form.get('code') ?? '')
          ? issue(true)
          : answer(400, { error: 'invalid_grant' });
      }
      return form.get('refresh_token') === state.refreshToken
        ? issue(false)
        : answer(400, { error: 'invalid_grant' });
    }
    const bearer = (init.headers.Authorization ?? '').replace('Bearer ', '');
    if (!state.validTokens.has(bearer)) return answer(401, { name: 'AUTHENTICATION_FAILURE' });
    if (state.forbidReports) return answer(403, { name: 'NOT_AUTHORIZED' });
    if (pathname === '/v1/reporting/balances') {
      const code = searchParams.get('currency_code');
      const balances = state.balances.balances.filter(
        (b: any) => code === 'ALL' || b.currency === code,
      );
      return answer(200, { ...state.balances, balances });
    }
    if (pathname === '/v1/reporting/transactions') {
      const from = Date.parse(searchParams.get('start_date')!);
      const to = Date.parse(searchParams.get('end_date')!);
      if (to - from > PAYPAL_WINDOW_MS) return answer(400, { name: 'INVALID_REQUEST' });
      const currency = searchParams.get('transaction_currency');
      const rows = state.transactions.filter(
        (t) =>
          dateOf(t) >= from &&
          dateOf(t) <= to &&
          t.transaction_info.transaction_amount.currency_code === currency,
      );
      if (rows.length > state.maxRowsPerRange) return answer(400, { name: 'RESULTSET_TOO_LARGE' });
      const page = Number(searchParams.get('page'));
      return answer(200, {
        transaction_details: rows.slice((page - 1) * state.pageSize, page * state.pageSize),
        page,
        total_items: rows.length,
        total_pages: Math.max(1, Math.ceil(rows.length / state.pageSize)),
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const makeHttp = (options: HttpClientOptions) =>
    new HttpClient({ ...options, fetchImpl, sleep: async () => undefined });
  const provider = new PayPalProvider(CONFIG, makeHttp, undefined, now);
  const searches = () => state.calls.filter((c) => c.url.includes('/v1/reporting/transactions'));
  return { state, makeHttp, provider, searches };
};

const credentials = (over: Partial<ReturnType<typeof readPayPalCredentials>> = {}) =>
  JSON.stringify({
    v: 1,
    accountId: 'MDXWPD67GEP5W',
    accessToken: 'at_1',
    refreshToken: 'rt_1',
    expiresAt: NOW.getTime() + 7 * 60 * 60_000,
    ...over,
  });

const conn = (address = credentials()) => ({ id: 'c1', address, metadata: {} });
const usdLink = { id: 'l1', assetKey: 'paypal:usd', chainId: null, currencyCode: 'USD' };
const since = new Date('2026-07-01T00:00:00Z');
const options = { since, maxPages: 5, maxRows: 1000 };

describe('PayPalProvider', () => {
  it('is registered only once the app is configured', () => {
    const http = fakePayPal().makeHttp;
    const off = ProviderRegistry.fromConfig({}, { adapters: [], makeHttp: http });
    expect(off.describe().find((p) => p.id === 'paypal')).toMatchObject({
      comingSoon: true,
      available: false,
    });
    const on = ProviderRegistry.fromConfig({ paypal: CONFIG }, { adapters: [], makeHttp: http });
    expect(on.describe().find((p) => p.id === 'paypal')).toMatchObject({
      comingSoon: false,
      available: true,
      auth: 'oauth',
      kind: 'payment',
    });
  });

  it('builds the sandbox sign-in URL with the reporting scopes', () => {
    const url = new URL(fakePayPal().provider.oauth.authorizeUrl('state-123'));
    expect(url.origin + url.pathname).toBe('https://www.sandbox.paypal.com/connect');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      flowEntry: 'static',
      client_id: CONFIG.clientId,
      response_type: 'code',
      scope: PAYPAL_SCOPES.join(' '),
      redirect_uri: CONFIG.redirectUri,
      state: 'state-123',
    });
    const live = new PayPalProvider({ ...CONFIG, environment: 'live' }, fakePayPal().makeHttp);
    expect(live.oauth.authorizeUrl('s')).toMatch(/^https:\/\/www\.paypal\.com\/connect\?/);
  });

  it('discovers one asset per balance currency, at the total balance', async () => {
    const { provider } = fakePayPal();
    const assets = await provider.discoverAssets(conn());
    expect(assets.map((a) => [a.assetKey, a.currencyCode, a.balance, a.supported])).toEqual([
      ['paypal:jpy', 'JPY', '5000', true],
      ['paypal:usd', 'USD', '1250.00', true],
      ['paypal:xts', null, '7.00', false],
    ]);
    expect(await provider.fetchBalance(conn(), usdLink)).toBe('1250.00');
    expect(provider.describeAsset('paypal:usd')).toMatchObject({
      currencyCode: 'USD',
      chainName: 'PayPal',
    });
    expect(provider.describeAsset('stripe:usd')).toBeNull();
  });

  it('reads history in windows of at most 31 days, oldest first, with fees as their own rows', async () => {
    const { provider, searches } = fakePayPal();
    const result = await provider.fetchTransactions(conn(), usdLink, null, options);
    expect(result.hasMore).toBe(false);
    expect(result.items.map((r) => [r.externalId, r.type, r.amount, r.description])).toEqual([
      ['5TY05013RG002845M:T0006', 'income', '465.00', 'Design work, June'],
      ['5TY05013RG002845M:T0006:fee', 'expense', '13.79', 'PayPal fee'],
      ['8AB12345CD678901E:T0400', 'expense', '300.00', 'Withdrawal to bank'],
      // The denied payment of 2026-08-20 is left out.
      ['1RF11111RF111111R:T1107', 'expense', '65.00', 'Reversal'],
      ['1RF11111RF111111R:T1107:fee', 'income', '1.89', 'PayPal fee refund'],
      ['2PN22222PN222222P:T0006', 'income', '120.50', 'Invoice 77'],
      ['2PN22222PN222222P:T0006:fee', 'expense', '3.80', 'PayPal fee'],
    ]);
    expect(result.items[0].date.toISOString()).toBe('2026-07-10T04:03:52.000Z');

    const ranges = searches().map((c) => {
      const q = new URL(c.url).searchParams;
      return [q.get('start_date'), q.get('end_date')];
    });
    expect(ranges).toEqual([
      ['2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'],
      ['2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'],
      ['2026-09-01T00:00:00.000Z', '2026-10-01T12:00:00.000Z'],
    ]);
    const first = new URL(searches()[0].url).searchParams;
    expect(first.get('transaction_currency')).toBe('USD');
    expect(first.get('fields')).toBe('transaction_info');
    expect(first.get('page_size')).toBe('500');

    // Caught up: the next run starts three hours before this one ended.
    expect(result.nextCursor).toEqual({
      from: new Date(NOW.getTime() - PAYPAL_OVERLAP_MS).toISOString(),
      page: 1,
    });
  });

  it('pages inside a window and resumes where a run stopped', async () => {
    const { provider, state, searches } = fakePayPal();
    state.pageSize = 1;
    const run1 = await provider.fetchTransactions(conn(), usdLink, null, {
      ...options,
      maxPages: 2,
    });
    expect(run1.hasMore).toBe(true);
    expect(run1.items.map((r) => r.externalId)).toEqual([
      '5TY05013RG002845M:T0006',
      '5TY05013RG002845M:T0006:fee',
      '8AB12345CD678901E:T0400',
    ]);
    // Stopped inside August, which has a second page (the denied payment).
    expect(run1.nextCursor).toEqual({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
      page: 2,
    });
    state.calls.length = 0;
    const run2 = await provider.fetchTransactions(conn(), usdLink, run1.nextCursor, options);
    expect(run2.hasMore).toBe(false);
    expect(run2.items.map((r) => r.externalId)).toEqual([
      '1RF11111RF111111R:T1107',
      '1RF11111RF111111R:T1107:fee',
      '2PN22222PN222222P:T0006',
      '2PN22222PN222222P:T0006:fee',
    ]);
    expect(new URL(searches()[0].url).searchParams.get('page')).toBe('2');
  });

  it('halves a window PayPal calls too large', async () => {
    const { provider, state, searches } = fakePayPal();
    state.maxRowsPerRange = 1;
    const result = await provider.fetchTransactions(conn(), usdLink, null, {
      since: new Date('2026-09-01T00:00:00Z'),
      maxPages: 5,
      maxRows: 1000,
    });
    expect(result.items.filter((r) => !r.isFee).map((r) => r.externalId)).toEqual([
      '1RF11111RF111111R:T1107',
      '2PN22222PN222222P:T0006',
    ]);
    expect(result.hasMore).toBe(false);
    expect(searches().length).toBeGreaterThan(2);
  });

  it('never goes back further than three years, and from_today asks for nothing', async () => {
    const { provider, searches } = fakePayPal();
    const all = await provider.fetchTransactions(conn(), usdLink, null, {
      since: null,
      maxPages: 5,
      maxRows: 1000,
    });
    const earliest = Date.parse(new URL(searches()[0].url).searchParams.get('start_date')!);
    expect(NOW.getTime() - earliest).toBeLessThan(3 * 365 * 24 * 60 * 60_000);
    // 36 windows fit in one run: empty ones don't count against the page limit.
    expect(all.hasMore).toBe(false);
    expect(all.items.filter((r) => !r.isFee)).toHaveLength(4);

    const fresh = fakePayPal();
    const today = await fresh.provider.fetchTransactions(conn(), usdLink, null, {
      ...options,
      since: NOW,
    });
    expect(today).toMatchObject({ items: [], hasMore: false });
    expect(fresh.searches()).toHaveLength(0);
    // Later runs look three hours back, but never before the link was made.
    expect(today.nextCursor).toEqual({ from: NOW.toISOString(), page: 1 });
  });

  it('maps a rejected token to REAUTH_REQUIRED and a refused report to PROVIDER_DOWN', async () => {
    const { provider, state } = fakePayPal();
    await expect(
      provider.discoverAssets(conn(credentials({ accessToken: 'old' }))),
    ).rejects.toBeInstanceOf(AuthRevokedError);
    state.forbidReports = true;
    await expect(provider.fetchBalance(conn(), usdLink)).rejects.toMatchObject({
      code: 'PROVIDER_DOWN',
    });
  });

  it('exchanges a code with the client credentials and names the account', async () => {
    const { provider, state } = fakePayPal();
    const grant = await provider.oauth.exchangeCode('code_good', NOW);
    expect(grant).toMatchObject({
      accountRef: 'MDXWPD67GEP5W',
      displayName: 'PayPal account',
      metadata: { addressHint: 'MDXW…EP5W' },
    });
    expect(readPayPalCredentials(grant.credentials)).toMatchObject({
      accountId: 'MDXWPD67GEP5W',
      accessToken: 'at_2',
      refreshToken: 'rt_1',
      expiresAt: NOW.getTime() + 28800 * 1000,
    });
    expect(state.calls[0].headers.Authorization).toBe(
      `Basic ${Buffer.from('paypal-client:paypal-secret').toString('base64')}`,
    );
    await expect(provider.oauth.exchangeCode('code_good', NOW)).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
  });

  it('renews the access token near expiry and keeps the refresh token', async () => {
    const { provider, state } = fakePayPal();
    expect(await provider.oauth.refresh(credentials(), NOW)).toBeNull();
    const rolled = await provider.oauth.refresh(
      credentials({ expiresAt: NOW.getTime() + 60_000 }),
      NOW,
    );
    expect(readPayPalCredentials(rolled!)).toMatchObject({
      accessToken: 'at_2',
      refreshToken: 'rt_1',
      accountId: 'MDXWPD67GEP5W',
    });
    state.refreshToken = 'revoked';
    await expect(
      provider.oauth.refresh(credentials({ expiresAt: NOW.getTime() - 1 }), NOW),
    ).rejects.toBeInstanceOf(AuthRevokedError);
  });
});

describe('connecting PayPal', () => {
  it('signs in, links the USD balance and reconciles it with the history', async () => {
    const store = new Store();
    let now = NOW;
    const paypal = fakePayPal(() => now);
    const ctx = build(store, paypal.provider, () => now);

    const { authorizeUrl } = await ctx.service.oauthStart(WS, 'user-1', 'paypal');
    const state = new URL(authorizeUrl).searchParams.get('state')!;
    const done = await ctx.service.oauthComplete(WS, 'user-1', 'paypal', {
      code: 'code_good',
      state,
    });
    expect(done.connection).toMatchObject({
      provider: 'paypal',
      kind: 'payment',
      addressHint: 'MDXW…EP5W',
    });
    const row = store.connections.get(done.connection.id)!;
    expect(row.credentialsEnc!.includes(Buffer.from('rt_1'))).toBe(false);

    const linked = await ctx.service.link(WS, 'user-1', done.connection.id, [
      { assetKey: 'paypal:usd', newAccount: { name: 'PayPal USD' }, syncMode: 'history' },
    ]);
    const link = linked.connection.links[0];
    // Four movements and three fees within the plan's 12 months of history.
    expect(linked.sync?.imported).toBe(7);
    expect(store.accounts.get(link.accountId)!.balance).toBe('1250.00000000');
    // 1250.00 at PayPal minus the 204.80 the history nets to.
    expect(store.rowsFor(link.id).find((t) => t.externalId === `open:${link.id}`)).toMatchObject({
      type: 'income',
      amount: '1045.20000000',
    });

    // Nine hours on: the token is renewed, the overlap re-reads nothing new.
    now = new Date(NOW.getTime() + 9 * 60 * 60_000);
    const again = await ctx.sync.syncConnection(done.connection.id, { trigger: 'scheduled' });
    expect(again.imported).toBe(0);
    expect(paypal.state.calls.filter((c) => c.url.endsWith('/v1/oauth2/token'))).toHaveLength(2);
    expect(store.accounts.get(link.accountId)!.balance).toBe('1250.00000000');
  });
});
