import { createBitcoinAdapter } from '@domains/connections/providers/crypto/chains/bitcoin';
import { createEvmAdapter } from '@domains/connections/providers/crypto/chains/evm';
import { createSolanaAdapter } from '@domains/connections/providers/crypto/chains/solana';
import { createTronAdapter, tronHex } from '@domains/connections/providers/crypto/chains/tron';
import { fromUnits, toDecimalString, toUnits } from '@domains/connections/providers/decimal';
import type { NormalizedTxn, ProviderLink } from '@domains/connections/providers/types';
import { fakeFetch, fixture, makeHttpWith } from './helpers';

/**
 * Chain adapters against recorded responses (tests/fixtures/connections):
 * Bitcoin, Tron and Solana recorded from public endpoints by
 * scripts/connections/record-fixtures.py; EVM hand-written to the Etherscan V2
 * shapes (no keyless API); tron/transactions-synthetic.json hand-written.
 */

const link = (assetKey: string, currencyCode: string, chainId: string | null = null): ProviderLink => ({
  id: 'link-1',
  assetKey,
  chainId,
  currencyCode,
});
const opts = { since: null, maxPages: 5, maxRows: 1000 };
const net = (rows: NormalizedTxn[]) =>
  fromUnits(rows.reduce((sum, r) => sum + (r.type === 'income' ? 1n : -1n) * toUnits(r.amount), 0n));
const byId = (rows: NormalizedTxn[], prefix: string) => rows.filter((r) => r.externalId.startsWith(prefix));

describe('bitcoin adapter (Esplora)', () => {
  const ME = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';
  const page1 = fixture('bitcoin', 'txs-page1.json');
  const page2 = fixture('bitcoin', 'txs-page2.json');
  const { fetchImpl, calls } = fakeFetch([
    [(u) => u.endsWith(`/address/${ME}`), fixture('bitcoin', 'address.json')],
    [(u) => u.endsWith(`/address/${ME}/txs/chain`), page1],
    [(u) => u.endsWith(`/address/${ME}/txs/chain/${page1[page1.length - 1].txid}`), page2],
    [(u) => u.includes('/txs/chain/'), []],
  ]);
  const adapter = createBitcoinAdapter({ config: {}, makeHttp: makeHttpWith(fetchImpl) });

  it('validates and normalises addresses', () => {
    expect(adapter.normalizeAddress(' BC1QXY2KGDYGJRSQTZQ2N0YRF2493P83KKFJHX0WLH ')).toBe(
      'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    );
    expect(adapter.normalizeAddress(ME)).toBe(ME);
    expect(adapter.normalizeAddress('0x1111111111111111111111111111111111111111')).toBeNull();
  });

  it('reads the confirmed balance (funded minus spent)', async () => {
    const stats = fixture('bitcoin', 'address.json').chain_stats;
    const expected = BigInt(stats.funded_txo_sum) - BigInt(stats.spent_txo_sum);
    expect(toUnits(await adapter.fetchBalance(ME, link('btc:native', 'BTC')))).toBe(expected);
    const [asset] = await adapter.discoverAssets(ME, []);
    expect(asset).toMatchObject({ assetKey: 'btc:native', currencyCode: 'BTC', supported: true });
    // Explicit User-Agent on every call.
    expect(calls[0].headers['User-Agent']).toMatch(/^TrackMyPocket\//);
  });

  it('maps incoming, outgoing and fee rows', async () => {
    const { items } = await adapter.fetchTransactions(ME, link('btc:native', 'BTC'), null, {
      ...opts,
      maxPages: 1,
    });
    const sent = page1.find((t: any) => t.txid.startsWith('4c35f9d158'));
    const rows = byId(items, sent.txid);
    expect(rows).toEqual([
      expect.objectContaining({ externalId: sent.txid, type: 'expense', amount: '0.00000295' }),
      expect.objectContaining({ externalId: `${sent.txid}:fee`, type: 'expense', amount: '0.00015131', isFee: true }),
    ]);
    const received = page1.find((t: any) => t.txid.startsWith('b54672dad7'));
    expect(byId(items, received.txid)).toEqual([
      expect.objectContaining({ type: 'income', amount: '0.00015426' }),
    ]);
    // Whole input went to the fee: only a fee row.
    const allFee = page1.find((t: any) => t.txid.startsWith('3645706fdf'));
    expect(byId(items, allFee.txid).map((r) => r.isFee)).toEqual([true]);
    // Every transaction nets to what it did to our outputs.
    for (const tx of page1) {
      const ours = (list: any[], pick: (x: any) => any) =>
        list.filter((x) => pick(x)?.scriptpubkey_address === ME).reduce((s, x) => s + BigInt(pick(x).value), 0n);
      const change = ours(tx.vout, (x) => x) - ours(tx.vin, (x) => x.prevout);
      expect(toUnits(net(byId(items, tx.txid)))).toBe(change);
    }
  });

  it('advances the cursor page by page and stops at the last scanned head', async () => {
    const first = await adapter.fetchTransactions(ME, link('btc:native', 'BTC'), null, { ...opts, maxPages: 1 });
    expect(first.hasMore).toBe(true);
    expect((first.nextCursor as any).resume.token).toBe(page1[page1.length - 1].txid);
    const second = await adapter.fetchTransactions(ME, link('btc:native', 'BTC'), first.nextCursor, opts);
    expect(second.hasMore).toBe(false);
    expect((second.nextCursor as any).head).toBe(page1[0].txid);
    // Nothing new: the next scan stops at the head straight away.
    const third = await adapter.fetchTransactions(ME, link('btc:native', 'BTC'), second.nextCursor, opts);
    expect(third.items).toEqual([]);
  });

  it('honours since', async () => {
    const since = new Date(page1[3].status.block_time * 1000);
    const { items, hasMore } = await adapter.fetchTransactions(ME, link('btc:native', 'BTC'), null, {
      ...opts,
      since,
    });
    expect(hasMore).toBe(false);
    expect(items.every((r) => r.date >= since)).toBe(true);
  });
});

describe('evm adapter (Etherscan V2)', () => {
  const ME = '0x1111111111111111111111111111111111111111';
  const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  const params = (u: string) => new URL(u).searchParams;
  const action = (name: string, extra: (p: URLSearchParams) => boolean = () => true) => (u: string) =>
    params(u).get('action') === name && extra(params(u));

  const build = (routes: any[] = [], apiKey = 'test-key') => {
    const fake = fakeFetch([
      ...routes,
      [action('balance'), fixture('evm', 'balance.json')],
      [action('tokenbalance', (p) => p.get('contractaddress') === USDC), fixture('evm', 'tokenbalance-usdc.json')],
      [action('tokenbalance'), fixture('evm', 'tokenbalance-zero.json')],
      [action('tokentx', (p) => p.get('contractaddress') === USDC), fixture('evm', 'tokentx-usdc.json')],
      [action('tokentx'), fixture('evm', 'tokentx-recent.json')],
      [action('txlist'), fixture('evm', 'txlist.json')],
      [action('getblocknobytime'), fixture('evm', 'getblocknobytime.json')],
      [action('eth_blockNumber'), fixture('evm', 'eth_blockNumber.json')],
    ]);
    return {
      ...fake,
      adapter: createEvmAdapter({
        config: { etherscan: { apiKey } },
        makeHttp: makeHttpWith(fake.fetchImpl),
      }),
    };
  };

  it('is unavailable without an API key, and hides paid-tier chains', () => {
    const { adapter } = build([], '');
    expect(adapter.isAvailable()).toEqual({ available: false, reason: 'ETHERSCAN_API_KEY is not set' });
    expect(adapter.chains().map((c) => c.id)).toEqual(['1', '137', '42161']);
  });

  it('discovers the native coin, held curated tokens and unsupported tokens', async () => {
    const { adapter, calls } = build();
    const assets = await adapter.discoverAssets(ME, ['1']);
    expect(assets.map((a) => [a.assetKey, a.balance, a.supported])).toEqual([
      ['evm:1:native', '1.245', true],
      [`evm:1:${USDC}`, '820.5', true],
      ['evm:1:0x6982508145454ce325ddbe47a25d4ec3d2311933', '0', false],
    ]);
    expect(assets[2]).toMatchObject({ symbol: 'PEPE', currencyCode: null });
    expect(params(calls[0].url).get('chainid')).toBe('1');
    expect(params(calls[0].url).get('apikey')).toBe('test-key');
  });

  it('maps native transfers with gas fees, failed and self transactions', async () => {
    const { adapter, calls } = build();
    const result = await adapter.fetchTransactions(ME, link('evm:1:native', 'ETH', '1'), null, {
      ...opts,
      since: new Date('2023-12-31T00:00:00Z'),
    });
    // Start block from getblocknobytime(since).
    expect(params(calls.find((c) => params(c.url).get('action') === 'txlist')!.url).get('startblock')).toBe(
      '19000000',
    );
    const rows = result.items.map((r) => [r.externalId, r.type, r.amount]);
    expect(rows).toEqual([
      ['0xaaa1', 'income', '1.5'],
      ['0xaaa2', 'expense', '0.25'],
      ['0xaaa2:fee', 'expense', '0.00063'],
      ['0xaaa3:fee', 'expense', '0.000525'], // failed: the fee only
      ['0xaaa4:fee', 'expense', '0.0005'], // token transfer's gas, on the native link
      ['0xaaa5:fee', 'expense', '0.00021'], // to self: the fee only
    ]);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toEqual({ startBlock: 19000050, page: 1 });
  });

  it('maps token transfers with the token decimals', async () => {
    const { adapter } = build();
    const result = await adapter.fetchTransactions(ME, link(`evm:1:${USDC}`, 'USDC', '1'), { startBlock: 0, page: 1 }, opts);
    expect(result.items.map((r) => [r.externalId, r.type, r.amount])).toEqual([
      ['0xbbb1:12', 'income', '1000'],
      ['0xaaa4:3', 'expense', '179.5'],
    ]);
    expect(await adapter.fetchBalance(ME, link(`evm:1:${USDC}`, 'USDC', '1'))).toBe('820.5');
  });

  it('turns Etherscan error bodies into typed errors', async () => {
    await expect(
      build([[action('balance'), fixture('evm', 'rate-limit.json')]]).adapter.fetchBalance(
        ME,
        link('evm:1:native', 'ETH', '1'),
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await expect(
      build([[action('balance'), fixture('evm', 'invalid-key.json')]]).adapter.fetchBalance(
        ME,
        link('evm:1:native', 'ETH', '1'),
      ),
    ).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
    const empty = build([[action('txlist'), fixture('evm', 'no-transactions.json')]]);
    const none = await empty.adapter.fetchTransactions(ME, link('evm:1:native', 'ETH', '1'), { startBlock: 5, page: 1 }, opts);
    expect(none).toEqual({ items: [], nextCursor: { startBlock: 5, page: 1 }, hasMore: false });
  });
});

describe('tron adapter (TronGrid)', () => {
  const ME = 'TYr4DLeAY4S7g9FkQQGvo8DmyPDvzb8HWq';
  const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  const build = (transactions = fixture('tron', 'transactions.json')) => {
    const fake = fakeFetch([
      [(u) => u.includes('/transactions/trc20'), fixture('tron', 'trc20-usdt.json')],
      [(u) => u.includes('/transactions?'), transactions],
      [(u) => u.endsWith(`/v1/accounts/${ME}`), fixture('tron', 'account.json')],
    ]);
    return createTronAdapter({ config: {}, makeHttp: makeHttpWith(fake.fetchImpl) });
  };

  it('validates base58check addresses', () => {
    const adapter = build();
    expect(adapter.normalizeAddress(ME)).toBe(ME);
    expect(adapter.normalizeAddress('TYr4DLeAY4S7g9FkQQGvo8DmyPDvzb8HWr')).toBeNull();
    expect(tronHex(ME)).toBe('41faf0a52cfb2648025538e4cbf3dee7bbad7a2658');
  });

  it('reads TRX and TRC-20 balances', async () => {
    const adapter = build();
    const assets = await adapter.discoverAssets(ME, []);
    expect(assets.map((a) => [a.assetKey, a.balance])).toEqual([
      ['tron:native', '0.055002'],
      [`tron:${USDT}`, '0.673154'],
    ]);
    expect(await adapter.fetchBalance(ME, link(`tron:${USDT}`, 'USDT'))).toBe('0.673154');
  });

  it('maps TRX transfers; fees only on what we sent', async () => {
    const { items } = await build().fetchTransactions(ME, link('tron:native', 'TRX'), null, opts);
    expect(items.find((r) => r.externalId.startsWith('47dc28a2'))).toMatchObject({ type: 'expense', amount: '0.4' });
    expect(items.find((r) => r.externalId.startsWith('46c57e17'))).toMatchObject({ type: 'income', amount: '0.8' });
    // The sender paid the fee of 46c57e17: no fee row for us.
    expect(items.some((r) => r.externalId.startsWith('46c57e17') && r.isFee)).toBe(false);
    // Our TRC-20 transfer's fee lands on the TRX link.
    expect(items.find((r) => r.externalId.startsWith('ce727612') && r.isFee)).toMatchObject({ amount: '0.345' });
    // TRC-10 and resource delegation aren't TRX movements.
    expect(items.some((r) => r.externalId.startsWith('d0aa0fc8') || r.externalId.startsWith('5e0c7d28'))).toBe(false);
  });

  it('books a failed transfer as its fee only', async () => {
    const { items } = await build(fixture('tron', 'transactions-synthetic.json')).fetchTransactions(
      ME,
      link('tron:native', 'TRX'),
      null,
      opts,
    );
    expect(items.map((r) => [r.externalId, r.type, r.amount])).toEqual([
      ['f00d0001', 'expense', '2.5'],
      ['f00d0001:fee', 'expense', '0.268'],
      ['f00d0002:fee', 'expense', '1.5'],
    ]);
  });

  it('maps TRC-20 transfers with 6 decimals', async () => {
    const { items } = await build().fetchTransactions(ME, link(`tron:${USDT}`, 'USDT'), null, opts);
    expect(items.find((r) => r.externalId.startsWith('ce727612'))).toMatchObject({ type: 'expense', amount: '5' });
    expect(items.find((r) => r.externalId.startsWith('01f891e6'))).toMatchObject({
      type: 'expense',
      amount: '3.826846',
    });
  });
});

describe('solana adapter (JSON-RPC)', () => {
  const ME = 'E16prLnWTwfLUYgXRTELYgw4u8QUnN9CAcHceLrDTjN1';
  const txs = fixture('solana', 'getTransaction.json');
  const sigs = fixture('solana', 'getSignaturesForAddress.json');
  const rpc = (method: string) => (_u: string, body: any) => body?.method === method;
  const fake = fakeFetch([
    [rpc('getBalance'), fixture('solana', 'getBalance.json')],
    [rpc('getTokenAccountsByOwner'), fixture('solana', 'getTokenAccountsByOwner.json')],
    [rpc('getSignaturesForAddress'), sigs],
    [rpc('getTransaction'), (_u: string, body: any) => ({ jsonrpc: '2.0', id: 1, result: txs[body.params[0]] })],
  ]);
  const adapter = createSolanaAdapter({ config: {}, makeHttp: makeHttpWith(fake.fetchImpl) });

  it('reads SOL and lists uncurated SPL tokens as unsupported', async () => {
    const assets = await adapter.discoverAssets(ME, []);
    expect(assets[0]).toMatchObject({ assetKey: 'sol:native', currencyCode: 'SOL', supported: true });
    expect(assets[0].balance).toBe(
      toDecimalString(fixture('solana', 'getBalance.json').result.value, 9),
    );
    expect(assets.slice(1).every((a) => !a.supported && a.currencyCode === null)).toBe(true);
  });

  it('nets each transaction to our balance change, fees as their own rows', async () => {
    const { items } = await adapter.fetchTransactions(ME, link('sol:native', 'SOL'), null, opts);
    for (const sig of sigs.result) {
      const tx = txs[sig.signature];
      const index = tx.transaction.message.accountKeys.findIndex((k: any) => k.pubkey === ME);
      const delta = BigInt(tx.meta.postBalances[index]) - BigInt(tx.meta.preBalances[index]);
      const rows = items.filter((r) => r.externalId.startsWith(sig.signature));
      // Rows are rounded to the ledger's 8 decimals (lamports have 9).
      const gap = toUnits(net(rows)) - toUnits(toDecimalString(delta, 9));
      expect(gap >= -2n && gap <= 2n).toBe(true);
      if (index === 0) expect(rows.some((r) => r.isFee)).toBe(true);
      if (sig.err) expect(rows.every((r) => r.isFee)).toBe(true);
    }
  });

  it('caps a sync on the public RPC', async () => {
    // 25-signature pages, at most 2 pages on the public endpoint.
    const result = await adapter.fetchTransactions(ME, link('sol:native', 'SOL'), null, { ...opts, maxPages: 5 });
    const pages = fake.calls.filter((c) => c.body?.method === 'getSignaturesForAddress');
    expect(pages[pages.length - 1].body.params[1].limit).toBe(25);
    expect(result.hasMore).toBe(false);
  });
});
