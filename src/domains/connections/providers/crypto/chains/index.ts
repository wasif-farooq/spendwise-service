import type { ChainAdapterFactory } from '../types';
import { createBitcoinAdapter } from './bitcoin';
import { createEvmAdapter } from './evm';
import { createSolanaAdapter } from './solana';
import { createTronAdapter } from './tron';

/**
 * Every chain family the wallet provider offers, in the order the apps list
 * them. A new chain is one adapter file in this folder plus one line here.
 */
export const CHAIN_ADAPTERS: readonly ChainAdapterFactory[] = [
  createEvmAdapter,
  createBitcoinAdapter,
  createTronAdapter,
  createSolanaAdapter,
];
