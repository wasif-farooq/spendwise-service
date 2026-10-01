import { RateLimitedError } from '@domains/connections/providers/errors';
import { FIRST_IMPORT_CAP, SYNC_CLAIM_STALE_MINUTES } from '@domains/connections/services/ConnectionSyncService';
import { Store, build, movement } from './fakes';

/**
 * The sync engine and the connection service end to end over in-memory
 * repositories: idempotent imports, reconciliation in both modes, the daily
 * adjustment, unlink keep/delete, the lock, failures and backoff.
 */

const WS = 'ws-1';
const ADDRESS = 'bc1qtestaddress';

const connectAndLink = async (
  store: Store,
  ctx: ReturnType<typeof build>,
  link: { accountId?: string; syncMode: 'history' | 'from_today' },
) => {
  const conn = await ctx.service.create(WS, 'user-1', { provider: 'crypto:bitcoin', address: ADDRESS });
  const result = await ctx.service.link(WS, 'user-1', conn.id, [
    link.accountId
      ? { assetKey: 'btc:native', accountId: link.accountId, syncMode: link.syncMode }
      : { assetKey: 'btc:native', newAccount: { name: 'BTC wallet' }, syncMode: link.syncMode },
  ]);
  return { conn, result, link: result.connection.links[0] };
};

describe('ConnectionSyncService', () => {
  it('history: imports, books an opening balance, and a second sync adds nothing', async () => {
    const store = new Store();
    const ctx = build(store);
    ctx.provider.movements = [
      movement('t1', '2026-03-01', 'income', '0.5'),
      movement('t2', '2026-04-01', 'expense', '0.1'),
      movement('t2:fee', '2026-04-01', 'expense', '0.0001'),
    ];
    ctx.provider.balanceValue = '1.2';

    const { result, link } = await connectAndLink(store, ctx, { syncMode: 'history' });
    expect(result.pending).toBe(false);
    expect(result.sync?.imported).toBe(3);
    expect(store.accounts.get(link.accountId)!.balance).toBe('1.20000000');
    const opening = store.rowsFor(link.id).find((t) => t.externalId === `open:${link.id}`)!;
    expect(opening).toMatchObject({ type: 'income', amount: '0.80010000', source: 'adjustment' });
    // Dated before the oldest imported movement.
    expect(opening.date.getTime()).toBeLessThan(new Date('2026-03-01').getTime());

    const rowsBefore = store.txns.length;
    const again = await ctx.sync.syncConnection(result.connection.id, { trigger: 'manual' });
    expect(again.imported).toBe(0);
    expect(store.txns.length).toBe(rowsBefore);
    expect(store.accounts.get(link.accountId)!.balance).toBe('1.20000000');
  });

  it('from_today: keeps manual history and adds one balance adjustment', async () => {
    const store = new Store();
    const ctx = build(store);
    const accountId = store.addAccount(WS, 'Savings BTC', 'BTC', [
      ['income', '0.3'],
      ['expense', '0.05'],
    ]);
    ctx.provider.movements = [movement('old', '2026-02-01', 'income', '9')];
    ctx.provider.balanceValue = '1';

    const { link } = await connectAndLink(store, ctx, { accountId, syncMode: 'from_today' });
    const rows = store.rowsFor(link.id);
    expect(rows.map((r) => [r.externalId, r.type, r.amount])).toEqual([
      [`adj:${link.id}:2026-10-01`, 'income', '0.75000000'],
    ]);
    expect(store.txns.filter((t) => t.accountId === accountId && t.source === 'manual')).toHaveLength(2);
    expect(store.accounts.get(accountId)!.balance).toBe('1.00000000');
  });

  it('drift: one adjustment per link per day, rewritten within the day', async () => {
    const store = new Store();
    let now = new Date('2026-10-01T08:00:00Z');
    const ctx = build(store, undefined, () => now);
    ctx.provider.balanceValue = '2';
    const { conn, link } = await connectAndLink(store, ctx, { syncMode: 'from_today' });

    // The wallet moves without a visible transaction (e.g. staking): drift.
    ctx.provider.balanceValue = '2.5';
    now = new Date('2026-10-01T18:00:00Z');
    await ctx.sync.syncConnection(conn.id, { trigger: 'manual' });
    let adjustments = store.rowsFor(link.id).filter((t) => t.source === 'adjustment');
    expect(adjustments.map((a) => a.amount)).toEqual(['2.50000000']);

    now = new Date('2026-10-02T08:00:00Z');
    ctx.provider.balanceValue = '2.4';
    await ctx.sync.syncConnection(conn.id, { trigger: 'manual' });
    adjustments = store.rowsFor(link.id).filter((t) => t.source === 'adjustment');
    expect(adjustments.map((a) => [a.externalId, a.type, a.amount])).toEqual([
      [`adj:${link.id}:2026-10-01`, 'income', '2.50000000'],
      [`adj:${link.id}:2026-10-02`, 'expense', '0.10000000'],
    ]);
    expect(store.accounts.get(link.accountId)!.balance).toBe('2.40000000');

    // Below dust: nothing booked.
    ctx.provider.balanceValue = '2.400000004';
    now = new Date('2026-10-03T08:00:00Z');
    await ctx.sync.syncConnection(conn.id, { trigger: 'manual' });
    expect(store.rowsFor(link.id).filter((t) => t.source === 'adjustment')).toHaveLength(2);
  });

  it('pages a long history across runs and reconciles only when it is complete', async () => {
    const store = new Store();
    const ctx = build(store);
    ctx.provider.pageSize = 1; // 5 rows a run
    ctx.provider.movements = Array.from({ length: 12 }, (_, i) =>
      movement(`m${i}`, `2026-0${1 + (i % 8)}-1${i % 9}`, 'income', '1'),
    );
    ctx.provider.balanceValue = '15';
    const { conn, result, link } = await connectAndLink(store, ctx, { syncMode: 'history' });
    expect(result.sync?.links[0]).toMatchObject({ imported: 5, hasMore: true, adjustment: null });
    expect(result.connection.links[0].backfillComplete).toBe(false);
    await ctx.sync.syncConnection(conn.id, { trigger: 'scheduled' });
    const last = await ctx.sync.syncConnection(conn.id, { trigger: 'scheduled' });
    expect(last.links[0]).toMatchObject({ imported: 2, hasMore: false, adjustment: '3.00000000' });
    expect(store.accounts.get(link.accountId)!.balance).toBe('15.00000000');
  });

  it('caps the first import and skips the rest of the backfill', async () => {
    const store = new Store();
    const ctx = build(store);
    ctx.provider.pageSize = 400; // 2,000 rows a run
    ctx.provider.movements = Array.from({ length: FIRST_IMPORT_CAP + 50 }, (_, i) =>
      movement(`m${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), 'income', '0.001'),
    );
    ctx.provider.balanceValue = '3';
    const { result, link } = await connectAndLink(store, ctx, { syncMode: 'history' });
    expect(result.sync?.links[0]).toMatchObject({ imported: FIRST_IMPORT_CAP, hasMore: false });
    expect(ctx.provider.skipped).toBe(1);
    expect(store.accounts.get(link.accountId)!.balance).toBe('3.00000000');
  });

  it('answers 409 SYNC_IN_PROGRESS while another run holds a live claim, and leaves it alone', async () => {
    const store = new Store();
    const ctx = build(store);
    const { conn } = await connectAndLink(store, ctx, { syncMode: 'from_today' });
    const row = store.connections.get(conn.id)!;
    const startedAt = new Date(Date.now() - 2 * 60_000);
    Object.assign(row, { status: 'syncing', syncStartedAt: startedAt });
    await expect(ctx.sync.syncConnection(conn.id, { trigger: 'manual' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'SYNC_IN_PROGRESS',
    });
    expect(row).toMatchObject({ status: 'syncing', syncStartedAt: startedAt, consecutiveFailures: 0 });
  });

  it('takes over a stale claim left by a crashed run', async () => {
    const store = new Store();
    const ctx = build(store);
    ctx.provider.balanceValue = '1';
    const { conn } = await connectAndLink(store, ctx, { syncMode: 'from_today' });
    Object.assign(store.connections.get(conn.id)!, {
      status: 'syncing',
      syncStartedAt: new Date(Date.now() - (SYNC_CLAIM_STALE_MINUTES + 1) * 60_000),
    });
    ctx.provider.balanceValue = '2';
    const result = await ctx.sync.syncConnection(conn.id, { trigger: 'scheduled' });
    expect(result.links[0].providerBalance).toBe('2.00000000');
    expect(store.connections.get(conn.id)).toMatchObject({ status: 'active', syncStartedAt: null });
  });

  it('calls the provider with no DB transaction open, then writes in short transactions', async () => {
    const store = new Store();
    const ctx = build(store);
    ctx.provider.movements = [movement('t1', '2026-03-01', 'income', '0.5')];
    ctx.provider.balanceValue = '0.5';
    const { conn } = await connectAndLink(store, ctx, { syncMode: 'history' });
    ctx.provider.callsInTx = 0;
    ctx.provider.callsTotal = 0;
    store.transactionsRun = 0;
    await ctx.sync.syncConnection(conn.id, { trigger: 'manual' });
    expect(ctx.provider.callsTotal).toBeGreaterThanOrEqual(2); // transactions + balance
    expect(ctx.provider.callsInTx).toBe(0);
    expect(store.transactionsRun).toBe(1); // one write transaction for the one link
    expect(store.inTx).toBe(false);
  });

  it('never moves a cursor back when an overlapping run advanced it during the fetch', async () => {
    const store = new Store();
    const ctx = build(store);
    ctx.provider.movements = [movement('t1', '2026-03-01', 'income', '0.5'), movement('t2', '2026-04-01', 'income', '0.25')];
    ctx.provider.balanceValue = '0.75';
    const { conn, link } = await connectAndLink(store, ctx, { syncMode: 'history' });
    const advanced = { p: 99, done: true, imported: 2, opened: true };
    ctx.provider.duringFetch = () => {
      // Another (taken-over) run commits a newer cursor while this one is fetching.
      store.links.get(link.id)!.cursor = advanced;
    };
    const rowsBefore = store.txns.length;
    const result = await ctx.sync.syncConnection(conn.id, { trigger: 'scheduled' });
    expect(result.links[0]).toMatchObject({ imported: 0, adjustment: null });
    expect(store.links.get(link.id)!.cursor).toEqual(advanced);
    expect(store.txns.length).toBe(rowsBefore);
    expect(store.connections.get(conn.id)!.status).toBe('active');
  });

  it('stores the error code and backs off exponentially; a success clears it', async () => {
    const store = new Store();
    const ctx = build(store);
    const { conn } = await connectAndLink(store, ctx, { syncMode: 'from_today' });
    ctx.provider.failWith = new RateLimitedError();
    await expect(ctx.sync.syncConnection(conn.id, { trigger: 'scheduled' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    const first = store.connections.get(conn.id)!;
    expect(first).toMatchObject({ status: 'error', lastErrorCode: 'RATE_LIMITED', consecutiveFailures: 1 });
    expect(first.nextSyncAt!.toISOString()).toBe('2026-10-01T12:15:00.000Z');
    await expect(ctx.sync.syncConnection(conn.id, { trigger: 'scheduled' })).rejects.toBeTruthy();
    expect(store.connections.get(conn.id)!.nextSyncAt!.toISOString()).toBe('2026-10-01T12:30:00.000Z');
    expect(ctx.activity.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sync_failed', entityId: conn.id }),
      expect.anything(),
    );

    // The claim is released on failure: the next run isn't refused.
    expect(store.connections.get(conn.id)!.syncStartedAt).toBeNull();
    ctx.provider.failWith = null;
    await ctx.sync.syncConnection(conn.id, { trigger: 'manual' });
    expect(store.connections.get(conn.id)).toMatchObject({ status: 'active', lastErrorCode: null, consecutiveFailures: 0, syncStartedAt: null });
  });
});

describe('ConnectionService', () => {
  it('unlink keeping imported rows turns them into plain transactions', async () => {
    const store = new Store();
    const ctx = build(store);
    ctx.provider.movements = [movement('t1', '2026-06-01', 'income', '0.5')];
    ctx.provider.balanceValue = '0.5';
    const { conn, link } = await connectAndLink(store, ctx, { syncMode: 'history' });
    await ctx.service.unlink(WS, 'user-1', conn.id, link.id, false);
    expect(store.links.size).toBe(0);
    const kept = store.txns.filter((t) => t.accountId === link.accountId);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ source: 'manual', connectionAccountId: null, externalId: null });
    expect(store.accounts.get(link.accountId)!.balance).toBe('0.50000000');
  });

  it('unlink deleting imported rows removes them and recomputes; the account stays', async () => {
    const store = new Store();
    const ctx = build(store);
    const accountId = store.addAccount(WS, 'BTC', 'BTC', [['income', '0.1']]);
    ctx.provider.movements = [movement('t1', '2026-06-01', 'income', '0.5')];
    ctx.provider.balanceValue = '0.7';
    const { conn, link } = await connectAndLink(store, ctx, { accountId, syncMode: 'history' });
    expect(store.accounts.get(accountId)!.balance).toBe('0.70000000');
    await ctx.service.remove(WS, 'user-1', conn.id, true);
    expect(store.connections.size).toBe(0);
    expect(store.rowsFor(link.id)).toHaveLength(0);
    expect(store.accounts.has(accountId)).toBe(true);
    expect(store.accounts.get(accountId)!.balance).toBe('0.10000000');
  });

  it('refuses a second link of the same account and a currency mismatch', async () => {
    const store = new Store();
    const ctx = build(store);
    const usd = store.addAccount(WS, 'Checking', 'USD');
    const conn = await ctx.service.create(WS, 'user-1', { provider: 'crypto:bitcoin', address: ADDRESS });
    await expect(
      ctx.service.link(WS, 'user-1', conn.id, [{ assetKey: 'btc:native', accountId: usd, syncMode: 'from_today' }]),
    ).rejects.toMatchObject({ statusCode: 400, code: 'CURRENCY_MISMATCH' });
    await expect(
      ctx.service.link(WS, 'user-1', conn.id, [{ assetKey: 'eth:native', newAccount: { name: 'x' }, syncMode: 'from_today' }]),
    ).rejects.toMatchObject({ code: 'ASSET_NOT_SUPPORTED' });
  });

  it('enforces the wallet limit (402) and the duplicate check (409)', async () => {
    const store = new Store();
    store.limits = { ownerId: 'owner-1', planName: 'Free', limits: { connectedWallets: 1, hasPaymentConnections: false } };
    const ctx = build(store);
    await ctx.service.create(WS, 'user-1', { provider: 'crypto:bitcoin', address: ADDRESS });
    await expect(
      ctx.service.create(WS, 'user-1', { provider: 'crypto:bitcoin', address: 'bc1qother' }),
    ).rejects.toMatchObject({
      statusCode: 402,
      code: 'CONNECTION_LIMIT_REACHED',
      extra: { feature: 'connectedWallets', usage: { used: 1, limit: 1 } },
    });
    store.limits.limits.connectedWallets = 5;
    await expect(
      ctx.service.create(WS, 'user-1', { provider: 'crypto:bitcoin', address: ADDRESS }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONNECTION_EXISTS' });
    await expect(ctx.service.create(WS, 'user-1', { provider: 'stripe' })).rejects.toMatchObject({
      statusCode: 402,
      code: 'PLAN_UPGRADE_REQUIRED',
    });
  });

  it('suggests an unlinked account of the same currency and never returns the address', async () => {
    const store = new Store();
    const ctx = build(store);
    const btc = store.addAccount(WS, 'Old BTC', 'BTC');
    store.addAccount(WS, 'Checking', 'USD');
    const conn = await ctx.service.create(WS, 'user-1', { provider: 'crypto:bitcoin', address: ADDRESS });
    expect(JSON.stringify(conn)).not.toContain(ADDRESS);
    const { assets, accountsUsage } = await ctx.service.discover(WS, conn.id);
    expect(assets[0]).toMatchObject({ assetKey: 'btc:native', suggestedAccountId: btc, linkedAccountId: null });
    expect(accountsUsage).toEqual({ used: 2, limit: 5 });
    const stored = store.connections.get(conn.id)!;
    expect(stored.credentialsEnc!.includes(Buffer.from(ADDRESS))).toBe(false);
    expect(stored.externalRef).toMatch(/^[0-9a-f]{64}$/);
  });
});
