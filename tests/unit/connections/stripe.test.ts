import { AuthRevokedError } from '@domains/connections/providers/errors';
import { FetchLike, HttpClient, HttpClientOptions } from '@domains/connections/providers/http';
import { ProviderRegistry } from '@domains/connections/providers/ProviderRegistry';
import { stripeAmount, stripeDecimals } from '@domains/connections/providers/stripe/money';
import {
  StripeProvider,
  readStripeCredentials,
} from '@domains/connections/providers/stripe/StripeProvider';
import { Store, build } from './fakes';
import { fixture } from './helpers';

/**
 * Stripe (a Stripe App installed with OAuth): the provider against recorded
 * shapes of Stripe's API, then the sign-in flow and a sync through the real
 * services over in-memory repositories.
 */

const WS = 'ws-1';
const NOW = new Date('2026-10-01T12:00:00Z');
const CONFIG = {
  clientId: 'ca_test_client',
  secretKey: 'sk_test_platform',
  redirectUri: 'https://app.example/connections/oauth/stripe/callback',
};

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}

/** A scriptable Stripe: balance, balance transaction pages and the token endpoint. */
const fakeStripe = () => {
  const state = {
    calls: [] as Call[],
    balance: fixture('stripe', 'balance.json'),
    pages: {
      first: fixture('stripe', 'balance_transactions_page1.json'),
      txn_3charge: fixture('stripe', 'balance_transactions_page2.json'),
    } as Record<string, any>,
    /** Access tokens Stripe accepts. */
    validTokens: new Set(['at_1']),
    /** The refresh token Stripe will accept next (rolled on every use). */
    refreshToken: 'rt_1',
    issued: 1,
    codes: new Map([['ac_good', 'acct_1ABCDEFGHIJKLMNO']]),
  };
  const answer = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  });
  const issue = (account: string) => {
    state.issued++;
    const accessToken = `at_${state.issued}`;
    state.refreshToken = `rt_${state.issued}`;
    state.validTokens = new Set([accessToken]);
    return answer(200, {
      access_token: accessToken,
      refresh_token: state.refreshToken,
      stripe_user_id: account,
      scope: 'stripe_apps',
      livemode: false,
      token_type: 'bearer',
    });
  };
  const fetchImpl: FetchLike = async (url, init) => {
    state.calls.push({ method: init.method, url, headers: init.headers, body: init.body });
    const { pathname, searchParams } = new URL(url);
    if (pathname === '/v1/oauth/token') {
      const form = new URLSearchParams(init.body);
      if (form.get('grant_type') === 'authorization_code') {
        const account = state.codes.get(form.get('code') ?? '');
        state.codes.delete(form.get('code') ?? '');
        return account ? issue(account) : answer(400, { error: 'invalid_grant' });
      }
      return form.get('refresh_token') === state.refreshToken
        ? issue('acct_1ABCDEFGHIJKLMNO')
        : answer(400, { error: 'invalid_grant' });
    }
    const bearer = (init.headers.Authorization ?? '').replace('Bearer ', '');
    if (!state.validTokens.has(bearer))
      return answer(401, { error: { type: 'invalid_request_error' } });
    if (pathname === '/v1/balance') return answer(200, state.balance);
    if (pathname === '/v1/balance_transactions') {
      const page = state.pages[searchParams.get('starting_after') ?? 'first'];
      if (!page) throw new Error(`Unexpected page: ${url}`);
      return answer(200, page);
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const makeHttp = (options: HttpClientOptions) =>
    new HttpClient({ ...options, fetchImpl, sleep: async () => undefined });
  return { state, makeHttp, provider: new StripeProvider(CONFIG, makeHttp) };
};

const credentials = (over: Partial<ReturnType<typeof readStripeCredentials>> = {}) =>
  JSON.stringify({
    v: 1,
    accountId: 'acct_1ABCDEFGHIJKLMNO',
    accessToken: 'at_1',
    refreshToken: 'rt_1',
    expiresAt: NOW.getTime() + 50 * 60_000,
    ...over,
  });

const conn = (address = credentials()) => ({ id: 'c1', address, metadata: {} });
const usdLink = { id: 'l1', assetKey: 'stripe:usd', chainId: null, currencyCode: 'USD' };
const options = { since: null, maxPages: 5, maxRows: 1000 };

describe('Stripe amounts', () => {
  it('uses the decimals Stripe uses for each currency', () => {
    expect(stripeDecimals('usd')).toBe(2);
    expect(stripeDecimals('JPY')).toBe(0);
    expect(stripeDecimals('kwd')).toBe(3);
    // Two decimals in the API for backwards compatibility.
    expect(stripeDecimals('ISK')).toBe(2);
    expect(stripeAmount(120050, 'usd')).toBe('1200.5');
    expect(stripeAmount(5000, 'jpy')).toBe('5000');
    expect(stripeAmount(-1234, 'kwd')).toBe('-1.234');
  });
});

describe('StripeProvider', () => {
  it('is registered only once the app is configured', () => {
    const http = fakeStripe().makeHttp;
    const off = ProviderRegistry.fromConfig({}, { adapters: [], makeHttp: http });
    expect(off.get('stripe')).toBeUndefined();
    expect(off.describe().find((p) => p.id === 'stripe')).toMatchObject({
      comingSoon: true,
      available: false,
    });
    const on = ProviderRegistry.fromConfig({ stripe: CONFIG }, { adapters: [], makeHttp: http });
    expect(on.describe().find((p) => p.id === 'stripe')).toMatchObject({
      comingSoon: false,
      available: true,
      auth: 'oauth',
      kind: 'payment',
      requiresPaidPlan: true,
    });
  });

  it('builds the sign-in URL with the client id, redirect and state', () => {
    const url = new URL(fakeStripe().provider.oauth.authorizeUrl('state-123'));
    expect(url.origin + url.pathname).toBe('https://marketplace.stripe.com/oauth/v2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CONFIG.clientId,
      redirect_uri: CONFIG.redirectUri,
      state: 'state-123',
    });
  });

  it('discovers one asset per balance currency: available + pending, exact decimals', async () => {
    const { provider, state } = fakeStripe();
    const assets = await provider.discoverAssets(conn());
    expect(assets.map((a) => [a.assetKey, a.currencyCode, a.balance, a.supported])).toEqual([
      ['stripe:jpy', 'JPY', '5000', true],
      ['stripe:usd', 'USD', '1225.5', true],
      ['stripe:xts', null, '7', false],
    ]);
    expect(state.calls[0].headers.Authorization).toBe('Bearer at_1');
    expect(await provider.fetchBalance(conn(), usdLink)).toBe('1225.5');
    expect(provider.describeAsset('stripe:usd')).toMatchObject({
      currencyCode: 'USD',
      chainName: 'Stripe',
    });
    expect(provider.describeAsset('stripe:xts')).toBeNull();
    expect(provider.describeAsset('btc:native')).toBeNull();
  });

  it('imports gross amounts with fees as their own rows, across pages', async () => {
    const { provider, state } = fakeStripe();
    const result = await provider.fetchTransactions(conn(), usdLink, null, options);
    expect(result.hasMore).toBe(false);
    expect(result.items.map((r) => [r.externalId, r.type, r.amount, r.description])).toEqual([
      ['txn_5payout', 'expense', '500', 'Payout to bank'],
      ['txn_4refund', 'expense', '20', 'REFUND FOR CHARGE (Order 1001)'],
      ['txn_4refund:fee', 'income', '0.88', 'Stripe fee refund'],
      ['txn_3charge', 'income', '100', 'Order 1002'],
      ['txn_3charge:fee', 'expense', '3.2', 'Stripe fee'],
      ['txn_2fee', 'expense', '15', 'Stripe fee'],
      ['txn_1charge', 'income', '20', 'Order 1001'],
      ['txn_1charge:fee', 'expense', '0.88', 'Stripe fee'],
    ]);
    // The rows add up to the nets Stripe reports: -500 - 19.12 + 96.80 - 15 + 19.12.
    const net = result.items.reduce(
      (sum, r) => sum + (r.type === 'income' ? 1 : -1) * Number(r.amount),
      0,
    );
    expect(net).toBeCloseTo(-418.2, 2);
    const pages = state.calls.filter((c) => c.url.includes('/v1/balance_transactions'));
    expect(pages.map((c) => new URL(c.url).searchParams.get('starting_after'))).toEqual([
      null,
      'txn_3charge',
    ]);
    expect(new URL(pages[0].url).searchParams.get('currency')).toBe('usd');

    // The next run stops at the newest movement already seen.
    state.calls.length = 0;
    const again = await provider.fetchTransactions(conn(), usdLink, result.nextCursor, options);
    expect(again.items).toEqual([]);
    expect(state.calls).toHaveLength(1);
  });

  it('stops at the history start', async () => {
    const { provider } = fakeStripe();
    const result = await provider.fetchTransactions(conn(), usdLink, null, {
      ...options,
      since: new Date(1790000350 * 1000),
    });
    expect(result.items.map((r) => r.externalId)).toEqual([
      'txn_5payout',
      'txn_4refund',
      'txn_4refund:fee',
    ]);
    expect(result.hasMore).toBe(false);
  });

  it('turns a rejected token into REAUTH_REQUIRED', async () => {
    const { provider } = fakeStripe();
    await expect(
      provider.discoverAssets(conn(credentials({ accessToken: 'at_old' }))),
    ).rejects.toBeInstanceOf(AuthRevokedError);
    await expect(provider.discoverAssets(conn('not json'))).rejects.toBeInstanceOf(
      AuthRevokedError,
    );
  });

  it('exchanges a code once, with the platform key and no retry', async () => {
    const { provider, state } = fakeStripe();
    const grant = await provider.oauth.exchangeCode('ac_good', NOW);
    expect(grant.accountRef).toBe('acct_1ABCDEFGHIJKLMNO');
    expect(grant.metadata.addressHint).toBe('acct_1AB…LMNO');
    expect(readStripeCredentials(grant.credentials)).toMatchObject({
      accessToken: 'at_2',
      refreshToken: 'rt_2',
      expiresAt: NOW.getTime() + 55 * 60_000,
    });
    const call = state.calls[0];
    expect(call.method).toBe('POST');
    expect(call.headers.Authorization).toBe(
      `Basic ${Buffer.from('sk_test_platform:').toString('base64')}`,
    );
    expect(call.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    await expect(provider.oauth.exchangeCode('ac_good', NOW)).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
    expect(state.calls).toHaveLength(2);
  });

  it('rolls tokens only when they are about to expire', async () => {
    const { provider, state } = fakeStripe();
    expect(await provider.oauth.refresh(credentials(), NOW)).toBeNull();
    expect(state.calls).toHaveLength(0);
    const rolled = await provider.oauth.refresh(
      credentials({ expiresAt: NOW.getTime() + 60_000 }),
      NOW,
    );
    expect(readStripeCredentials(rolled!)).toMatchObject({
      accessToken: 'at_2',
      refreshToken: 'rt_2',
    });
    // The old refresh token is spent.
    await expect(
      provider.oauth.refresh(credentials({ expiresAt: NOW.getTime() - 1 }), NOW),
    ).rejects.toBeInstanceOf(AuthRevokedError);
  });
});

describe('connecting Stripe', () => {
  const setup = (plan: 'Free' | 'Pro' = 'Pro') => {
    const store = new Store();
    if (plan === 'Free') {
      store.limits = {
        ownerId: 'owner-1',
        planName: 'Free',
        limits: { connectedWallets: 2, hasPaymentConnections: false },
      };
    }
    const stripe = fakeStripe();
    let now = NOW;
    const ctx = build(store, stripe.provider, () => now);
    const stateOf = (authorizeUrl: string) => new URL(authorizeUrl).searchParams.get('state')!;
    const connect = async () => {
      const { authorizeUrl } = await ctx.service.oauthStart(WS, 'user-1', 'stripe', {
        returnTo: 'mobile',
      });
      return ctx.service.oauthComplete(WS, 'user-1', 'stripe', {
        code: 'ac_good',
        state: stateOf(authorizeUrl),
      });
    };
    return { store, stripe, ctx, stateOf, connect, setNow: (d: Date) => (now = d) };
  };

  it('needs a paid plan, and refuses the address route', async () => {
    await expect(
      setup('Free').ctx.service.oauthStart(WS, 'user-1', 'stripe'),
    ).rejects.toMatchObject({
      statusCode: 402,
      code: 'PLAN_UPGRADE_REQUIRED',
    });
    await expect(
      setup().ctx.service.create(WS, 'user-1', { provider: 'stripe', address: 'acct_123' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'OAUTH_REQUIRED' });
  });

  it('creates the connection with encrypted tokens; the state works once, for its owner', async () => {
    const { store, ctx, stateOf, connect } = setup();
    const done = await connect();
    expect(done).toMatchObject({ returnTo: 'mobile', reconnected: false });
    expect(done.connection).toMatchObject({
      provider: 'stripe',
      kind: 'payment',
      displayName: 'Stripe account',
      addressHint: 'acct_1AB…LMNO',
      status: 'active',
    });
    const row = store.connections.get(done.connection.id)!;
    expect(row.credentialsEnc!.includes(Buffer.from('rt_2'))).toBe(false);
    expect(JSON.stringify(done)).not.toContain('at_2');
    expect(row.externalRef).toMatch(/^[0-9a-f]{64}$/);

    const { authorizeUrl } = await ctx.service.oauthStart(WS, 'user-1', 'stripe');
    const state = stateOf(authorizeUrl);
    for (const [ws, user] of [
      ['ws-2', 'user-1'],
      [WS, 'user-2'],
    ]) {
      await expect(
        ctx.service.oauthComplete(ws, user, 'stripe', { code: 'ac_x', state }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'OAUTH_STATE_INVALID' });
    }
    // Spent by the failed attempts above; an unknown state is refused the same way.
    await expect(
      ctx.service.oauthComplete(WS, 'user-1', 'stripe', { code: 'ac_x', state }),
    ).rejects.toMatchObject({ code: 'OAUTH_STATE_INVALID' });
  });

  it('answers 502 OAUTH_FAILED when Stripe refuses the code', async () => {
    const { ctx, stateOf } = setup();
    const { authorizeUrl } = await ctx.service.oauthStart(WS, 'user-1', 'stripe');
    await expect(
      ctx.service.oauthComplete(WS, 'user-1', 'stripe', {
        code: 'ac_bad',
        state: stateOf(authorizeUrl),
      }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'OAUTH_FAILED' });
  });

  it('syncs a linked balance: history, fees, opening balance; then rolls and stores the tokens', async () => {
    const { store, stripe, ctx, connect, setNow } = setup();
    const { connection } = await connect();
    const { assets } = await ctx.service.discover(WS, connection.id);
    expect(assets.find((a) => a.assetKey === 'stripe:usd')).toMatchObject({
      balance: '1225.5',
      supported: true,
    });

    const linked = await ctx.service.link(WS, 'user-1', connection.id, [
      { assetKey: 'stripe:usd', newAccount: { name: 'Stripe USD' }, syncMode: 'history' },
    ]);
    const link = linked.connection.links[0];
    expect(linked.sync?.imported).toBe(8);
    expect(store.accounts.get(link.accountId)!.balance).toBe('1225.50000000');
    // 1225.50 on Stripe minus the -418.20 the history nets to.
    expect(store.rowsFor(link.id).find((t) => t.externalId === `open:${link.id}`)).toMatchObject({
      type: 'income',
      amount: '1643.70000000',
    });

    // An hour later the access token has expired: the sync rolls the pair and stores it.
    setNow(new Date(NOW.getTime() + 60 * 60_000));
    const before = store.connections.get(connection.id)!.credentialsEnc;
    const again = await ctx.sync.syncConnection(connection.id, { trigger: 'scheduled' });
    expect(again.imported).toBe(0);
    expect(store.connections.get(connection.id)!.credentialsEnc).not.toEqual(before);
    expect(stripe.state.calls.filter((c) => c.url.endsWith('/v1/oauth/token'))).toHaveLength(2);
    expect(store.accounts.get(link.accountId)!.balance).toBe('1225.50000000');
  });

  it('marks the connection reauth_required when Stripe revokes access, and signing in again repairs it', async () => {
    const { store, stripe, ctx, connect, setNow } = setup();
    const { connection } = await connect();
    await ctx.service.link(WS, 'user-1', connection.id, [
      { assetKey: 'stripe:usd', newAccount: { name: 'Stripe USD' }, syncMode: 'from_today' },
    ]);

    // The user uninstalls the app: the refresh token stops working.
    stripe.state.refreshToken = 'revoked';
    setNow(new Date(NOW.getTime() + 60 * 60_000));
    await expect(
      ctx.sync.syncConnection(connection.id, { trigger: 'scheduled' }),
    ).rejects.toMatchObject({
      code: 'REAUTH_REQUIRED',
    });
    expect(store.connections.get(connection.id)).toMatchObject({
      status: 'reauth_required',
      lastErrorCode: 'REAUTH_REQUIRED',
    });

    stripe.state.codes.set('ac_good', 'acct_1ABCDEFGHIJKLMNO');
    const again = await connect();
    expect(again.reconnected).toBe(true);
    expect(again.connection.id).toBe(connection.id);
    expect(again.connection.links).toHaveLength(1);
    expect(store.connections.size).toBe(1);
    expect(store.connections.get(connection.id)).toMatchObject({
      status: 'active',
      lastErrorCode: null,
    });
    await ctx.sync.syncConnection(connection.id, { trigger: 'manual' });
    expect(store.connections.get(connection.id)!.status).toBe('active');
  });
});
