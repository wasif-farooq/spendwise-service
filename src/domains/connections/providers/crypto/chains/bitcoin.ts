import { HttpStatusError } from '../../http';
import { InvalidAddressError, ProviderDownError } from '../../errors';
import { toDecimalString } from '../../decimal';
import type { DiscoveredAsset, NormalizedTxn } from '../../types';
import { assetKeyOf, findCuratedAsset, shortAddress } from '../assets';
import { pageNewestFirst } from '../newestFirst';
import type { ChainAdapter, ChainAdapterFactory } from '../types';

/**
 * Bitcoin through an Esplora API (mempool.space by default, no key).
 *   balance  confirmed funded minus spent (GET /address/:a)
 *   history  GET /address/:a/txs/chain[/:last_seen_txid], 25 per page, newest first
 *   fee      the whole fee, when one of our inputs paid it
 * Only confirmed transactions are read, so the balance and the history agree.
 */

interface EsploraTx {
  txid: string;
  fee: number;
  status: { confirmed: boolean; block_time?: number };
  vin: Array<{ prevout?: { scriptpubkey_address?: string; value: number } | null }>;
  vout: Array<{ scriptpubkey_address?: string; value: number }>;
}

const BECH32 = /^(bc1)[02-9ac-hj-np-z]{11,87}$/;
const BASE58 = /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/;
const DECIMALS = 8;

export const createBitcoinAdapter: ChainAdapterFactory = ({ config, makeHttp }) => {
  const baseUrl = (config.bitcoin?.baseUrl || 'https://mempool.space/api').replace(/\/+$/, '');
  const http = makeHttp({
    name: 'Bitcoin data service',
    timeoutMs: config.httpTimeoutMs,
    maxPerSecond: 4,
  });
  const native = findCuratedAsset('bitcoin', null, 'native')!;
  const assetKey = assetKeyOf('bitcoin', null, 'native');

  const get = async <T>(path: string): Promise<T> => {
    try {
      return await http.getJson<T>(`${baseUrl}${path}`);
    } catch (error) {
      if (error instanceof HttpStatusError && error.status === 400) throw new InvalidAddressError();
      if (error instanceof HttpStatusError) throw new ProviderDownError(error.message, error.status);
      throw error;
    }
  };

  const balanceOf = async (address: string): Promise<string> => {
    const info = await get<{
      chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
    }>(`/address/${address}`);
    const sats =
      BigInt(info.chain_stats.funded_txo_sum) - BigInt(info.chain_stats.spent_txo_sum);
    return toDecimalString(sats, DECIMALS);
  };

  const mapTx = (address: string, tx: EsploraTx): NormalizedTxn[] => {
    const date = new Date((tx.status.block_time ?? 0) * 1000);
    let ours_in = 0n;
    let ours_out = 0n;
    let from: string | undefined;
    let to: string | undefined;
    for (const input of tx.vin) {
      const addr = input.prevout?.scriptpubkey_address;
      if (addr === address) ours_in += BigInt(input.prevout!.value);
      else if (addr && !from) from = addr;
    }
    for (const output of tx.vout) {
      const addr = output.scriptpubkey_address;
      if (addr === address) ours_out += BigInt(output.value);
      else if (addr && !to) to = addr;
    }

    const rows: NormalizedTxn[] = [];
    if (ours_in > 0n) {
      const fee = BigInt(tx.fee ?? 0);
      const sent = ours_in - ours_out - fee;
      if (sent > 0n) {
        rows.push({
          externalId: tx.txid,
          date,
          type: 'expense',
          amount: toDecimalString(sent, DECIMALS),
          description: to ? `Sent BTC to ${shortAddress(to)}` : 'Sent BTC',
          counterparty: to,
        });
      } else if (sent < 0n) {
        rows.push({
          externalId: tx.txid,
          date,
          type: 'income',
          amount: toDecimalString(-sent, DECIMALS),
          description: 'Received BTC',
        });
      }
      if (fee > 0n) {
        rows.push({
          externalId: `${tx.txid}:fee`,
          date,
          type: 'expense',
          amount: toDecimalString(fee, DECIMALS),
          description: 'Bitcoin network fee',
          isFee: true,
        });
      }
    } else if (ours_out > 0n) {
      rows.push({
        externalId: tx.txid,
        date,
        type: 'income',
        amount: toDecimalString(ours_out, DECIMALS),
        description: from ? `Received BTC from ${shortAddress(from)}` : 'Received BTC',
        counterparty: from,
      });
    }
    return rows;
  };

  const adapter: ChainAdapter = {
    providerId: 'crypto:bitcoin',
    family: 'bitcoin',
    name: 'Bitcoin',
    description: 'Bitcoin wallet (native SegWit, Taproot or legacy address)',
    isAvailable: () => ({ available: true }),
    chains: () => [{ id: 'bitcoin', name: 'Bitcoin', nativeCurrency: 'BTC', available: true }],
    normalizeAddress(raw) {
      const value = raw.trim();
      if (BECH32.test(value.toLowerCase())) return value.toLowerCase();
      if (BASE58.test(value)) return value;
      return null;
    },
    async discoverAssets(address) {
      const balance = await balanceOf(address);
      const asset: DiscoveredAsset = {
        assetKey,
        chainId: null,
        chainName: 'Bitcoin',
        symbol: native.symbol,
        name: native.name,
        currencyCode: native.currencyCode,
        balance,
        supported: true,
      };
      return [asset];
    },
    fetchBalance: (address) => balanceOf(address),
    fetchTransactions(address, _link, cursor, options) {
      return pageNewestFirst<EsploraTx>({
        cursor,
        since: options.since,
        maxPages: options.maxPages,
        maxRows: options.maxRows,
        fetchPage: async (token) => {
          const txs = await get<EsploraTx[]>(
            `/address/${address}/txs/chain${token ? `/${token}` : ''}`,
          );
          const list = Array.isArray(txs) ? txs : [];
          // Esplora pages hold 25 confirmed transactions; fewer means the end.
          return { items: list, next: list.length >= 25 ? list[list.length - 1].txid : null };
        },
        idOf: (tx) => tx.txid,
        timeOf: (tx) =>
          tx.status?.confirmed && tx.status.block_time ? new Date(tx.status.block_time * 1000) : null,
        map: (tx) => mapTx(address, tx),
      });
    },
  };
  return adapter;
};
