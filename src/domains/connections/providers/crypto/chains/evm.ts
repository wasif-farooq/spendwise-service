import { HttpStatusError } from '../../http';
import {
  AuthRevokedError,
  InvalidAddressError,
  ProviderDownError,
  RateLimitedError,
} from '../../errors';
import { toDecimalString } from '../../decimal';
import type { ChainInfo, DiscoveredAsset, FetchResult, NormalizedTxn } from '../../types';
import {
  EVM_CHAINS,
  assetKeyOf,
  curatedForChain,
  evmChainName,
  findCuratedAsset,
  parseAssetKey,
  shortAddress,
} from '../assets';
import type { ChainAdapter, ChainAdapterFactory } from '../types';

/**
 * Ethereum and EVM chains through Etherscan V2 (one key, `chainid` per call).
 *   balance  action=balance (native), action=tokenbalance (curated tokens)
 *   history  action=txlist (native) / action=tokentx&contractaddress (token),
 *            ascending from a start block; the first block comes from
 *            getblocknobytime(since)
 *   fee      gasUsed * gasPrice on transactions we sent, failed ones included,
 *            always on the native-coin link (token transfers' gas shows up in
 *            the native txlist because we sent the call)
 * Without ETHERSCAN_API_KEY the provider reports available:false.
 */

const PAGE_SIZE = 100;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

interface EvmCursor {
  startBlock: number;
  page: number;
}

interface TxListItem {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  isError?: string;
  txreceipt_status?: string;
}

interface TokenTxItem {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  tokenSymbol?: string;
  tokenName?: string;
  tokenDecimal?: string;
  logIndex?: string;
}

interface EtherscanResponse<T> {
  status: string;
  message: string;
  result: T;
}

export const createEvmAdapter: ChainAdapterFactory = ({ config, makeHttp }) => {
  const settings = config.etherscan ?? {};
  const baseUrl = (settings.baseUrl || 'https://api.etherscan.io/v2/api').replace(/\/+$/, '');
  const apiKey = settings.apiKey || '';
  const paidPlan = Boolean(settings.paidPlan);
  // Free tier: 5 calls/s; stay under it.
  const http = makeHttp({ name: 'Etherscan', timeoutMs: config.httpTimeoutMs, maxPerSecond: 4 });

  const chainList = (): ChainInfo[] =>
    EVM_CHAINS.filter((c) => paidPlan || !c.requiresPaidKey).map((c) => ({
      id: c.id,
      name: c.name,
      nativeCurrency: c.nativeCurrency,
      available: Boolean(apiKey),
      requiresPaidKey: c.requiresPaidKey,
    }));

  const call = async <T>(chainId: string, params: Record<string, string>): Promise<T> => {
    const query = new URLSearchParams({ chainid: chainId, ...params, apikey: apiKey });
    let body: EtherscanResponse<T>;
    try {
      body = await http.getJson<EtherscanResponse<T>>(`${baseUrl}?${query.toString()}`);
    } catch (error) {
      if (error instanceof HttpStatusError)
        throw new ProviderDownError(error.message, error.status);
      throw error;
    }
    if (body && body.status === '1') return body.result;
    const detail = String((body as any)?.result ?? body?.message ?? '');
    if (/no (transactions|records) found/i.test(`${body?.message} ${detail}`)) {
      return [] as unknown as T;
    }
    if (/rate limit/i.test(detail)) throw new RateLimitedError('Etherscan rate limit reached', 429);
    if (/invalid api key|missing\/invalid api key/i.test(detail)) {
      throw new AuthRevokedError('The Etherscan API key was rejected.');
    }
    if (/invalid address/i.test(detail)) throw new InvalidAddressError();
    if (/free api access is not supported|upgrade your api plan/i.test(detail)) {
      throw new ProviderDownError('This network needs a paid Etherscan plan.');
    }
    // eth_* proxy calls answer JSON-RPC style ({ jsonrpc, result }) without status.
    if (body && (body as any).jsonrpc && (body as any).result !== undefined) {
      return (body as any).result as T;
    }
    throw new ProviderDownError('Etherscan returned an error.');
  };

  const chainOf = (assetKey: string) => {
    const parsed = parseAssetKey(assetKey);
    if (!parsed || parsed.family !== 'evm' || !parsed.chainId) {
      throw new InvalidAddressError('Unknown EVM asset.');
    }
    return parsed;
  };

  const nativeBalance = async (address: string, chainId: string) =>
    String(
      await call<string>(chainId, { module: 'account', action: 'balance', address, tag: 'latest' }),
    );

  const tokenBalance = async (address: string, chainId: string, contract: string) =>
    String(
      await call<string>(chainId, {
        module: 'account',
        action: 'tokenbalance',
        contractaddress: contract,
        address,
        tag: 'latest',
      }),
    );

  const startBlockFor = async (chainId: string, since: Date | null): Promise<number> => {
    if (!since) return 0;
    const seconds = Math.floor(since.getTime() / 1000);
    if (seconds >= Math.floor(Date.now() / 1000) - 60) {
      const hex = await call<string>(chainId, { module: 'proxy', action: 'eth_blockNumber' });
      return parseInt(String(hex), 16) || 0;
    }
    const block = await call<string>(chainId, {
      module: 'block',
      action: 'getblocknobytime',
      timestamp: String(seconds),
      closest: 'after',
    });
    return Number(block) || 0;
  };

  const readCursor = (cursor: unknown): EvmCursor | null => {
    const c = cursor as Partial<EvmCursor> | null;
    if (!c || typeof c.startBlock !== 'number') return null;
    return {
      startBlock: c.startBlock,
      page: typeof c.page === 'number' && c.page > 0 ? c.page : 1,
    };
  };

  const mapNative = (address: string, symbol: string, chainName: string, tx: TxListItem) => {
    const me = address.toLowerCase();
    const from = tx.from?.toLowerCase();
    const to = tx.to?.toLowerCase();
    const date = new Date(Number(tx.timeStamp) * 1000);
    const failed = tx.isError === '1' || tx.txreceipt_status === '0';
    const rows: NormalizedTxn[] = [];
    const value = BigInt(tx.value || '0');

    if (!failed && value > 0n && from !== to) {
      if (from === me) {
        rows.push({
          externalId: tx.hash,
          date,
          type: 'expense',
          amount: toDecimalString(value, 18),
          description: `Sent ${symbol} to ${shortAddress(tx.to || '')}`,
          counterparty: tx.to,
        });
      } else if (to === me) {
        rows.push({
          externalId: tx.hash,
          date,
          type: 'income',
          amount: toDecimalString(value, 18),
          description: `Received ${symbol} from ${shortAddress(tx.from)}`,
          counterparty: tx.from,
        });
      }
    }
    if (from === me) {
      const fee = BigInt(tx.gasUsed || '0') * BigInt(tx.gasPrice || '0');
      if (fee > 0n) {
        rows.push({
          externalId: `${tx.hash}:fee`,
          date,
          type: 'expense',
          amount: toDecimalString(fee, 18),
          description: failed
            ? `${chainName} network fee (failed transaction)`
            : `${chainName} network fee`,
          isFee: true,
        });
      }
    }
    return rows;
  };

  const mapToken = (address: string, symbol: string, decimals: number, tx: TokenTxItem) => {
    const me = address.toLowerCase();
    const from = tx.from?.toLowerCase();
    const to = tx.to?.toLowerCase();
    if (from === to) return [];
    const value = BigInt(tx.value || '0');
    if (value === 0n) return [];
    const date = new Date(Number(tx.timeStamp) * 1000);
    const externalId = tx.logIndex ? `${tx.hash}:${tx.logIndex}` : tx.hash;
    if (from === me) {
      return [
        {
          externalId,
          date,
          type: 'expense' as const,
          amount: toDecimalString(value, decimals),
          description: `Sent ${symbol} to ${shortAddress(tx.to)}`,
          counterparty: tx.to,
        },
      ];
    }
    if (to === me) {
      return [
        {
          externalId,
          date,
          type: 'income' as const,
          amount: toDecimalString(value, decimals),
          description: `Received ${symbol} from ${shortAddress(tx.from)}`,
          counterparty: tx.from,
        },
      ];
    }
    return [];
  };

  const adapter: ChainAdapter = {
    providerId: 'crypto:evm',
    family: 'evm',
    name: 'Ethereum + EVM',
    description: 'Ethereum, Polygon, Arbitrum and other EVM chains',
    isAvailable: () =>
      apiKey ? { available: true } : { available: false, reason: 'ETHERSCAN_API_KEY is not set' },
    chains: chainList,
    normalizeAddress(raw) {
      const value = raw.trim();
      return ADDRESS.test(value) ? value.toLowerCase() : null;
    },

    async discoverAssets(address, chainIds) {
      const allowed = new Set(chainList().map((c) => c.id));
      const chains = (chainIds.length ? chainIds : ['1']).filter((id) => allowed.has(id));
      const assets: DiscoveredAsset[] = [];
      for (const chainId of chains) {
        const chainName = evmChainName(chainId);
        for (const asset of curatedForChain('evm', chainId)) {
          const raw =
            asset.contract === 'native'
              ? await nativeBalance(address, chainId)
              : await tokenBalance(address, chainId, asset.contract);
          const balance = toDecimalString(raw, asset.decimals);
          // The native coin always shows; tokens only when held.
          if (asset.contract !== 'native' && balance === '0') continue;
          assets.push({
            assetKey: assetKeyOf('evm', chainId, asset.contract),
            chainId,
            chainName,
            symbol: asset.symbol,
            name: asset.name,
            currencyCode: asset.currencyCode,
            balance,
            supported: true,
          });
        }
        // Tokens seen in recent transfers that aren't curated: shown, not imported.
        const recent = await call<TokenTxItem[]>(chainId, {
          module: 'account',
          action: 'tokentx',
          address,
          page: '1',
          offset: '50',
          sort: 'desc',
        });
        const seen = new Set<string>();
        for (const tx of Array.isArray(recent) ? recent : []) {
          const contract = tx.contractAddress?.toLowerCase();
          if (!contract || seen.has(contract) || findCuratedAsset('evm', chainId, contract))
            continue;
          seen.add(contract);
          assets.push({
            assetKey: assetKeyOf('evm', chainId, contract),
            chainId,
            chainName,
            symbol: (tx.tokenSymbol || '?').slice(0, 12),
            name: (tx.tokenName || 'Unknown token').slice(0, 60),
            currencyCode: null,
            balance: '0',
            supported: false,
          });
        }
      }
      return assets;
    },

    async skipBackfill(_address, link) {
      const { chainId } = chainOf(link.assetKey);
      return { startBlock: await startBlockFor(chainId!, new Date()), page: 1 };
    },

    async fetchBalance(address, link) {
      const { chainId, contract } = chainOf(link.assetKey);
      const asset = findCuratedAsset('evm', chainId, contract);
      if (!asset) throw new InvalidAddressError('This token is not supported.');
      const raw =
        contract === 'native'
          ? await nativeBalance(address, chainId!)
          : await tokenBalance(address, chainId!, contract);
      return toDecimalString(raw, asset.decimals);
    },

    async fetchTransactions(address, link, cursor, options): Promise<FetchResult> {
      const { chainId, contract } = chainOf(link.assetKey);
      const asset = findCuratedAsset('evm', chainId, contract);
      if (!asset) throw new InvalidAddressError('This token is not supported.');
      const chainName = evmChainName(chainId);

      let state = readCursor(cursor) ?? {
        startBlock: await startBlockFor(chainId!, options.since),
        page: 1,
      };
      const items: NormalizedTxn[] = [];
      let hasMore = false;
      const sinceMs = options.since?.getTime() ?? 0;

      for (let pages = 0; pages < options.maxPages; pages++) {
        const params: Record<string, string> = {
          module: 'account',
          action: contract === 'native' ? 'txlist' : 'tokentx',
          address,
          startblock: String(state.startBlock),
          endblock: '99999999',
          page: String(state.page),
          offset: String(PAGE_SIZE),
          sort: 'asc',
        };
        if (contract !== 'native') params.contractaddress = contract;
        const list = await call<Array<TxListItem | TokenTxItem>>(chainId!, params);
        const rows = Array.isArray(list) ? list : [];

        for (const tx of rows) {
          if (Number(tx.timeStamp) * 1000 < sinceMs) continue;
          items.push(
            ...(contract === 'native'
              ? mapNative(address, asset.symbol, chainName, tx as TxListItem)
              : mapToken(address, asset.symbol, asset.decimals, tx as TokenTxItem)),
          );
        }

        const lastBlock = rows.length
          ? Number(rows[rows.length - 1].blockNumber)
          : state.startBlock;
        if (rows.length < PAGE_SIZE) {
          // Caught up. Re-read the last block next time; de-duplication absorbs it.
          state = { startBlock: lastBlock, page: 1 };
          hasMore = false;
          break;
        }
        // A full page: continue after it. If the whole page sat in one block, page within it.
        state =
          lastBlock > state.startBlock
            ? { startBlock: lastBlock, page: 1 }
            : { startBlock: state.startBlock, page: state.page + 1 };
        hasMore = true;
        if (items.length >= options.maxRows) break;
      }

      return { items, nextCursor: state, hasMore };
    },
  };
  return adapter;
};
