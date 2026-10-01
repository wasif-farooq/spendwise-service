import { HttpStatusError } from '../../http';
import { InvalidAddressError, ProviderDownError, RateLimitedError } from '../../errors';
import { toDecimalString } from '../../decimal';
import type { DiscoveredAsset, NormalizedTxn } from '../../types';
import { assetKeyOf, curatedForChain, findCuratedAsset, parseAssetKey, shortAddress } from '../assets';
import { base58CheckDecode, base58CheckEncode } from '../base58';
import { pageNewestFirst } from '../newestFirst';
import type { ChainAdapter, ChainAdapterFactory } from '../types';

/**
 * Tron through TronGrid (an API key is optional; keyless calls are throttled).
 *   balance  GET /v1/accounts/:a → balance (sun) and trc20 [{contract: amount}]
 *   history  GET /v1/accounts/:a/transactions (TRX) or /transactions/trc20
 *            ?contract_address= (tokens), newest first, min_timestamp + fingerprint
 *   fee      ret[0].fee (sun) on transactions we sent, on the TRX link
 */

const PAGE_SIZE = 50;
const SUN_DECIMALS = 6;
const MAX_UNSUPPORTED = 5;

interface TronTx {
  txID: string;
  block_timestamp: number;
  ret?: Array<{ contractRet?: string; fee?: number }>;
  raw_data?: {
    contract?: Array<{
      type: string;
      parameter?: { value?: { amount?: number; owner_address?: string; to_address?: string } };
    }>;
  };
}

interface Trc20Tx {
  transaction_id: string;
  block_timestamp: number;
  from: string;
  to: string;
  value: string;
  type?: string;
  token_info?: { symbol?: string; decimals?: number; address?: string };
}

interface TronPage<T> {
  data?: T[];
  success?: boolean;
  meta?: { fingerprint?: string };
}

/** Base58 T-address → the 41-prefixed hex form TronGrid uses in raw_data. */
export const tronHex = (address: string): string | null => {
  const payload = base58CheckDecode(address);
  if (!payload || payload.length !== 21 || payload[0] !== 0x41) return null;
  return payload.toString('hex');
};

export const tronBase58 = (hex: string): string =>
  base58CheckEncode(Buffer.from(hex.replace(/^0x/, ''), 'hex'));

export const createTronAdapter: ChainAdapterFactory = ({ config, makeHttp }) => {
  const baseUrl = (config.tron?.baseUrl || 'https://api.trongrid.io').replace(/\/+$/, '');
  const apiKey = config.tron?.apiKey || '';
  const http = makeHttp({
    name: 'TronGrid',
    timeoutMs: config.httpTimeoutMs,
    maxPerSecond: apiKey ? 10 : 3,
    headers: apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {},
  });
  const trx = findCuratedAsset('tron', null, 'native')!;

  const get = async <T>(path: string): Promise<T> => {
    try {
      return await http.getJson<T>(`${baseUrl}${path}`);
    } catch (error) {
      if (error instanceof HttpStatusError) {
        if (error.status === 400) throw new InvalidAddressError();
        if (error.status === 403) throw new RateLimitedError('TronGrid refused the request', 403);
        throw new ProviderDownError(error.message, error.status);
      }
      throw error;
    }
  };

  const account = async (address: string) => {
    const page = await get<TronPage<{ balance?: number; trc20?: Array<Record<string, string>> }>>(
      `/v1/accounts/${address}`,
    );
    // An address that never received anything has no account yet: empty, not invalid.
    return page.data?.[0] ?? { balance: 0, trc20: [] };
  };

  const trc20Balances = (acct: { trc20?: Array<Record<string, string>> }) => {
    const balances = new Map<string, string>();
    for (const entry of acct.trc20 ?? []) {
      for (const [contract, amount] of Object.entries(entry)) balances.set(contract, amount);
    }
    return balances;
  };

  const mapTrx = (meHex: string, tx: TronTx): NormalizedTxn[] => {
    const contract = tx.raw_data?.contract?.[0];
    if (!contract) return [];
    const value = contract.parameter?.value ?? {};
    const owner = value.owner_address?.toLowerCase();
    const date = new Date(tx.block_timestamp);
    const success = (tx.ret?.[0]?.contractRet ?? 'SUCCESS') === 'SUCCESS';
    const rows: NormalizedTxn[] = [];

    if (contract.type === 'TransferContract' && success) {
      const to = value.to_address?.toLowerCase();
      const amount = BigInt(value.amount ?? 0);
      if (amount > 0n && owner !== to) {
        if (owner === meHex) {
          const counterparty = to ? tronBase58(to) : undefined;
          rows.push({
            externalId: tx.txID,
            date,
            type: 'expense',
            amount: toDecimalString(amount, SUN_DECIMALS),
            description: counterparty ? `Sent TRX to ${shortAddress(counterparty)}` : 'Sent TRX',
            counterparty,
          });
        } else if (to === meHex) {
          const counterparty = owner ? tronBase58(owner) : undefined;
          rows.push({
            externalId: tx.txID,
            date,
            type: 'income',
            amount: toDecimalString(amount, SUN_DECIMALS),
            description: counterparty
              ? `Received TRX from ${shortAddress(counterparty)}`
              : 'Received TRX',
            counterparty,
          });
        }
      }
    }
    const fee = BigInt(tx.ret?.[0]?.fee ?? 0);
    if (owner === meHex && fee > 0n) {
      rows.push({
        externalId: `${tx.txID}:fee`,
        date,
        type: 'expense',
        amount: toDecimalString(fee, SUN_DECIMALS),
        description: success ? 'Tron network fee' : 'Tron network fee (failed transaction)',
        isFee: true,
      });
    }
    return rows;
  };

  const adapter: ChainAdapter = {
    providerId: 'crypto:tron',
    family: 'tron',
    name: 'Tron',
    description: 'TRX and TRC-20 tokens such as USDT',
    isAvailable: () => ({ available: true }),
    chains: () => [{ id: 'tron', name: 'Tron', nativeCurrency: 'TRX', available: true }],
    normalizeAddress(raw) {
      const value = raw.trim();
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value) && tronHex(value) ? value : null;
    },

    async discoverAssets(address) {
      const acct = await account(address);
      const tokens = trc20Balances(acct);
      const assets: DiscoveredAsset[] = [
        {
          assetKey: assetKeyOf('tron', null, 'native'),
          chainId: null,
          chainName: 'Tron',
          symbol: trx.symbol,
          name: trx.name,
          currencyCode: trx.currencyCode,
          balance: toDecimalString(BigInt(acct.balance ?? 0), SUN_DECIMALS),
          supported: true,
        },
      ];
      for (const asset of curatedForChain('tron', null)) {
        if (asset.contract === 'native') continue;
        const raw = tokens.get(asset.contract);
        if (!raw || BigInt(raw) === 0n) continue;
        assets.push({
          assetKey: assetKeyOf('tron', null, asset.contract),
          chainId: null,
          chainName: 'Tron',
          symbol: asset.symbol,
          name: asset.name,
          currencyCode: asset.currencyCode,
          balance: toDecimalString(raw, asset.decimals),
          supported: true,
        });
      }
      // Wallets collect spam tokens; list a few, never import them.
      let unsupported = 0;
      for (const [contract, raw] of tokens) {
        if (findCuratedAsset('tron', null, contract) || BigInt(raw || '0') === 0n) continue;
        if (++unsupported > MAX_UNSUPPORTED) break;
        assets.push({
          assetKey: assetKeyOf('tron', null, contract),
          chainId: null,
          chainName: 'Tron',
          symbol: '?',
          name: `Token ${shortAddress(contract)}`,
          currencyCode: null,
          balance: '0',
          supported: false,
        });
      }
      return assets;
    },

    async fetchBalance(address, link) {
      const parsed = parseAssetKey(link.assetKey);
      const acct = await account(address);
      if (!parsed || parsed.contract === 'native') {
        return toDecimalString(BigInt(acct.balance ?? 0), SUN_DECIMALS);
      }
      const asset = findCuratedAsset('tron', null, parsed.contract);
      if (!asset) throw new InvalidAddressError('This token is not supported.');
      return toDecimalString(trc20Balances(acct).get(parsed.contract) ?? '0', asset.decimals);
    },

    fetchTransactions(address, link, cursor, options) {
      const parsed = parseAssetKey(link.assetKey);
      const contract = parsed?.contract ?? 'native';
      const minTimestamp = options.since ? `&min_timestamp=${options.since.getTime()}` : '';
      const meHex = tronHex(address)!;

      if (contract === 'native') {
        return pageNewestFirst<TronTx>({
          cursor,
          since: options.since,
          maxPages: options.maxPages,
          maxRows: options.maxRows,
          fetchPage: async (token) => {
            const page = await get<TronPage<TronTx>>(
              `/v1/accounts/${address}/transactions?limit=${PAGE_SIZE}&only_confirmed=true${minTimestamp}${
                token ? `&fingerprint=${encodeURIComponent(token)}` : ''
              }`,
            );
            // Internal transactions come back without raw_data; they're not ours to book.
            const items = (page.data ?? []).filter((tx) => tx.txID && tx.raw_data);
            return { items, next: page.meta?.fingerprint ?? null };
          },
          idOf: (tx) => tx.txID,
          timeOf: (tx) => (tx.block_timestamp ? new Date(tx.block_timestamp) : null),
          map: (tx) => mapTrx(meHex, tx),
        });
      }

      const asset = findCuratedAsset('tron', null, contract);
      if (!asset) throw new InvalidAddressError('This token is not supported.');
      return pageNewestFirst<Trc20Tx>({
        cursor,
        since: options.since,
        maxPages: options.maxPages,
        maxRows: options.maxRows,
        fetchPage: async (token) => {
          const page = await get<TronPage<Trc20Tx>>(
            `/v1/accounts/${address}/transactions/trc20?limit=${PAGE_SIZE}&only_confirmed=true&contract_address=${contract}${minTimestamp}${
              token ? `&fingerprint=${encodeURIComponent(token)}` : ''
            }`,
          );
          return { items: page.data ?? [], next: page.meta?.fingerprint ?? null };
        },
        idOf: (tx) => `${tx.transaction_id}:${tx.from}:${tx.to}`,
        timeOf: (tx) => (tx.block_timestamp ? new Date(tx.block_timestamp) : null),
        map: (tx) => {
          const value = BigInt(tx.value || '0');
          if (value === 0n || tx.from === tx.to) return [];
          const date = new Date(tx.block_timestamp);
          const amount = toDecimalString(value, asset.decimals);
          if (tx.from === address) {
            return [
              {
                externalId: tx.transaction_id,
                date,
                type: 'expense',
                amount,
                description: `Sent ${asset.symbol} to ${shortAddress(tx.to)}`,
                counterparty: tx.to,
              },
            ];
          }
          if (tx.to === address) {
            return [
              {
                externalId: tx.transaction_id,
                date,
                type: 'income',
                amount,
                description: `Received ${asset.symbol} from ${shortAddress(tx.from)}`,
                counterparty: tx.from,
              },
            ];
          }
          return [];
        },
      });
    },
  };
  return adapter;
};
