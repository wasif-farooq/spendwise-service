import { HttpStatusError } from '../../http';
import { InvalidAddressError, ProviderDownError, RateLimitedError } from '../../errors';
import { toDecimalString } from '../../decimal';
import type { DiscoveredAsset, NormalizedTxn } from '../../types';
import { assetKeyOf, findCuratedAsset, parseAssetKey, shortAddress } from '../assets';
import { base58Decode } from '../base58';
import { pageNewestFirst, readNewestFirstCursor } from '../newestFirst';
import type { ChainAdapter, ChainAdapterFactory } from '../types';

/**
 * Solana through JSON-RPC (SOLANA_RPC_URL, e.g. Helius; default the public
 * mainnet RPC, which is heavily throttled, so a sync reads at most ~50
 * signatures there).
 *   balance  getBalance (lamports); getTokenAccountsByOwner (SPL tokens)
 *   history  getSignaturesForAddress(before) newest first, then getTransaction
 *            for each; amounts from pre/post balances. A token link reads the
 *            signatures of its token account, where the transfers are recorded.
 *   fee      meta.fee when we were the fee payer, on the SOL link
 */

const PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGqPxH4bRfE8XvJ6YzF5wM8d';
const LAMPORT_DECIMALS = 9;
const MAX_UNSUPPORTED = 5;

interface SignatureInfo {
  signature: string;
  blockTime: number | null;
  err: unknown;
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
}

interface ParsedTransaction {
  blockTime: number | null;
  meta: {
    fee: number;
    err: unknown;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
  } | null;
  transaction: { message: { accountKeys: Array<{ pubkey: string; signer?: boolean } | string> } };
}

interface TokenAccount {
  pubkey: string;
  account: {
    data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } };
  };
}

export const createSolanaAdapter: ChainAdapterFactory = ({ config, makeHttp }) => {
  const rpcUrl = config.solana?.rpcUrl || PUBLIC_RPC;
  const onPublicRpc = !config.solana?.rpcUrl;
  const http = makeHttp({
    name: 'Solana RPC',
    timeoutMs: config.httpTimeoutMs,
    maxPerSecond: onPublicRpc ? 3 : 10,
  });
  const sol = findCuratedAsset('solana', null, 'native')!;
  const pageSize = onPublicRpc ? 25 : 100;
  const maxPagesCap = onPublicRpc ? 2 : Infinity;
  let rpcId = 0;

  const rpc = async <T>(method: string, params: unknown[]): Promise<T> => {
    let body: { result?: T; error?: { code: number; message: string } };
    try {
      body = await http.postJson(rpcUrl, { jsonrpc: '2.0', id: ++rpcId, method, params });
    } catch (error) {
      if (error instanceof HttpStatusError) {
        if (error.status === 403 || error.status === 401) {
          throw new RateLimitedError('The Solana RPC refused the request', error.status);
        }
        throw new ProviderDownError(error.message, error.status);
      }
      throw error;
    }
    if (body?.error) {
      if (body.error.code === -32602 || /invalid param|wrongsize|invalid public key/i.test(body.error.message)) {
        throw new InvalidAddressError();
      }
      if (/rate|too many/i.test(body.error.message)) throw new RateLimitedError(body.error.message);
      throw new ProviderDownError('The Solana RPC returned an error.');
    }
    return body?.result as T;
  };

  const tokenAccounts = async (owner: string): Promise<TokenAccount[]> => {
    const result = await rpc<{ value: TokenAccount[] }>('getTokenAccountsByOwner', [
      owner,
      { programId: TOKEN_PROGRAM },
      { encoding: 'jsonParsed' },
    ]);
    return result?.value ?? [];
  };

  const lamports = async (address: string) => {
    const result = await rpc<{ value: number }>('getBalance', [address]);
    return BigInt(result?.value ?? 0);
  };

  const keyOf = (key: { pubkey: string } | string) => (typeof key === 'string' ? key : key.pubkey);

  const getTx = (signature: string) =>
    rpc<ParsedTransaction | null>('getTransaction', [
      signature,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
    ]);

  const mapNative = async (address: string, info: SignatureInfo): Promise<NormalizedTxn[]> => {
    const tx = await getTx(info.signature);
    if (!tx?.meta) return [];
    const keys = tx.transaction.message.accountKeys.map(keyOf);
    const index = keys.indexOf(address);
    if (index < 0) return [];
    const date = new Date((tx.blockTime ?? info.blockTime ?? 0) * 1000);
    const delta = BigInt(tx.meta.postBalances[index] ?? 0) - BigInt(tx.meta.preBalances[index] ?? 0);
    const feePayer = index === 0;
    const fee = feePayer ? BigInt(tx.meta.fee ?? 0) : 0n;
    const moved = delta + fee;
    const rows: NormalizedTxn[] = [];
    if (moved > 0n) {
      rows.push({
        externalId: info.signature,
        date,
        type: 'income',
        amount: toDecimalString(moved, LAMPORT_DECIMALS),
        description: feePayer ? 'Received SOL' : `Received SOL from ${shortAddress(keys[0])}`,
        counterparty: feePayer ? undefined : keys[0],
      });
    } else if (moved < 0n) {
      rows.push({
        externalId: info.signature,
        date,
        type: 'expense',
        amount: toDecimalString(-moved, LAMPORT_DECIMALS),
        description: 'Sent SOL',
      });
    }
    if (fee > 0n) {
      rows.push({
        externalId: `${info.signature}:fee`,
        date,
        type: 'expense',
        amount: toDecimalString(fee, LAMPORT_DECIMALS),
        description: tx.meta.err ? 'Solana network fee (failed transaction)' : 'Solana network fee',
        isFee: true,
      });
    }
    return rows;
  };

  const mapToken = async (
    owner: string,
    mint: string,
    symbol: string,
    decimals: number,
    info: SignatureInfo,
  ): Promise<NormalizedTxn[]> => {
    const tx = await getTx(info.signature);
    if (!tx?.meta || tx.meta.err) return [];
    const sum = (list?: TokenBalance[]) =>
      (list ?? [])
        .filter((b) => b.mint === mint && b.owner === owner)
        .reduce((total, b) => total + BigInt(b.uiTokenAmount.amount), 0n);
    const delta = sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances);
    if (delta === 0n) return [];
    return [
      {
        externalId: info.signature,
        date: new Date((tx.blockTime ?? info.blockTime ?? 0) * 1000),
        type: delta > 0n ? 'income' : 'expense',
        amount: toDecimalString(delta > 0n ? delta : -delta, decimals),
        description: delta > 0n ? `Received ${symbol}` : `Sent ${symbol}`,
      },
    ];
  };

  const signaturesPage = async (account: string, before: string | null) => {
    const options: Record<string, unknown> = { limit: pageSize };
    if (before) options.before = before;
    const list = (await rpc<SignatureInfo[]>('getSignaturesForAddress', [account, options])) ?? [];
    return { items: list, next: list.length >= pageSize ? list[list.length - 1].signature : null };
  };

  const adapter: ChainAdapter = {
    providerId: 'crypto:solana',
    family: 'solana',
    name: 'Solana',
    description: 'SOL and SPL tokens such as USDC',
    isAvailable: () => ({ available: true }),
    chains: () => [{ id: 'solana', name: 'Solana', nativeCurrency: 'SOL', available: true }],
    normalizeAddress(raw) {
      const value = raw.trim();
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return null;
      return base58Decode(value)?.length === 32 ? value : null;
    },

    async discoverAssets(address) {
      const assets: DiscoveredAsset[] = [
        {
          assetKey: assetKeyOf('solana', null, 'native'),
          chainId: null,
          chainName: 'Solana',
          symbol: sol.symbol,
          name: sol.name,
          currencyCode: sol.currencyCode,
          balance: toDecimalString(await lamports(address), LAMPORT_DECIMALS),
          supported: true,
        },
      ];
      const byMint = new Map<string, bigint>();
      for (const account of await tokenAccounts(address)) {
        const info = account.account.data.parsed.info;
        byMint.set(info.mint, (byMint.get(info.mint) ?? 0n) + BigInt(info.tokenAmount.amount));
      }
      let unsupported = 0;
      for (const [mint, raw] of byMint) {
        if (raw === 0n) continue;
        const asset = findCuratedAsset('solana', null, mint);
        if (asset) {
          assets.push({
            assetKey: assetKeyOf('solana', null, mint),
            chainId: null,
            chainName: 'Solana',
            symbol: asset.symbol,
            name: asset.name,
            currencyCode: asset.currencyCode,
            balance: toDecimalString(raw, asset.decimals),
            supported: true,
          });
        } else if (++unsupported <= MAX_UNSUPPORTED) {
          assets.push({
            assetKey: assetKeyOf('solana', null, mint),
            chainId: null,
            chainName: 'Solana',
            symbol: '?',
            name: `Token ${shortAddress(mint)}`,
            currencyCode: null,
            balance: '0',
            supported: false,
          });
        }
      }
      return assets;
    },

    async fetchBalance(address, link) {
      const parsed = parseAssetKey(link.assetKey);
      if (!parsed || parsed.contract === 'native') {
        return toDecimalString(await lamports(address), LAMPORT_DECIMALS);
      }
      const asset = findCuratedAsset('solana', null, parsed.contract);
      if (!asset) throw new InvalidAddressError('This token is not supported.');
      let raw = 0n;
      for (const account of await tokenAccounts(address)) {
        const info = account.account.data.parsed.info;
        if (info.mint === parsed.contract) raw += BigInt(info.tokenAmount.amount);
      }
      return toDecimalString(raw, asset.decimals);
    },

    async fetchTransactions(address, link, cursor, options) {
      const parsed = parseAssetKey(link.assetKey);
      const mint = parsed?.contract ?? 'native';
      const limits = {
        maxPages: Math.min(options.maxPages, maxPagesCap),
        maxRows: options.maxRows,
      };

      if (mint === 'native') {
        return pageNewestFirst<SignatureInfo>({
          cursor,
          since: options.since,
          ...limits,
          fetchPage: (token) => signaturesPage(address, token),
          idOf: (s) => s.signature,
          timeOf: (s) => (s.blockTime ? new Date(s.blockTime * 1000) : null),
          map: (s) => mapNative(address, s),
        });
      }

      const asset = findCuratedAsset('solana', null, mint);
      if (!asset) throw new InvalidAddressError('This token is not supported.');
      // The token account holding this mint (the largest, normally the associated one).
      const state = readNewestFirstCursor(cursor);
      let tokenAccount = state.extra?.tokenAccount as string | undefined;
      if (!tokenAccount) {
        const accounts = (await tokenAccounts(address)).filter(
          (a) => a.account.data.parsed.info.mint === mint,
        );
        accounts.sort((a, b) =>
          BigInt(b.account.data.parsed.info.tokenAmount.amount) >
          BigInt(a.account.data.parsed.info.tokenAmount.amount)
            ? 1
            : -1,
        );
        tokenAccount = accounts[0]?.pubkey;
      }
      if (!tokenAccount) {
        return { items: [], nextCursor: { ...state, head: state.head }, hasMore: false };
      }
      const result = await pageNewestFirst<SignatureInfo>({
        cursor: { ...state, extra: { ...(state.extra ?? {}), tokenAccount } },
        since: options.since,
        ...limits,
        fetchPage: (token) => signaturesPage(tokenAccount!, token),
        idOf: (s) => s.signature,
        timeOf: (s) => (s.blockTime ? new Date(s.blockTime * 1000) : null),
        map: (s) => mapToken(address, mint, asset.symbol, asset.decimals, s),
      });
      return result;
    },
  };
  return adapter;
};
