/**
 * Curated crypto assets: {family, chain, contract | native} → the ledger
 * currency code and the token's decimals. Only these are imported; any other
 * token a wallet holds is listed as unsupported (greyed out, never synced), so
 * spam tokens can't reach the ledger.
 *
 * Every currency code here must be in CRYPTO_CURRENCIES (domains/currencies);
 * a unit test asserts it. The currency registry itself stays chain-agnostic.
 */

export type CryptoFamily = 'evm' | 'bitcoin' | 'tron' | 'solana';

export interface CuratedAsset {
  family: CryptoFamily;
  /** EVM chain id ("1", "137"…); null for single-network families. */
  chainId: string | null;
  /** 'native' or the token contract / mint (EVM lower-cased). */
  contract: string;
  currencyCode: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface EvmChain {
  id: string;
  name: string;
  nativeCurrency: string;
  /** Not covered by Etherscan's free API tier: hidden unless ETHERSCAN_PAID_PLAN. */
  requiresPaidKey: boolean;
}

export const EVM_CHAINS: readonly EvmChain[] = [
  { id: '1', name: 'Ethereum', nativeCurrency: 'ETH', requiresPaidKey: false },
  { id: '137', name: 'Polygon', nativeCurrency: 'POL', requiresPaidKey: false },
  { id: '42161', name: 'Arbitrum', nativeCurrency: 'ETH', requiresPaidKey: false },
  { id: '56', name: 'BNB Chain', nativeCurrency: 'BNB', requiresPaidKey: true },
  { id: '10', name: 'OP Mainnet', nativeCurrency: 'ETH', requiresPaidKey: true },
  { id: '8453', name: 'Base', nativeCurrency: 'ETH', requiresPaidKey: true },
  { id: '43114', name: 'Avalanche', nativeCurrency: 'AVAX', requiresPaidKey: true },
];

const native = (
  family: CryptoFamily,
  chainId: string | null,
  code: string,
  name: string,
  decimals: number,
): CuratedAsset => ({
  family,
  chainId,
  contract: 'native',
  currencyCode: code,
  symbol: code,
  name,
  decimals,
});

const token = (
  family: CryptoFamily,
  chainId: string | null,
  contract: string,
  code: string,
  name: string,
  decimals: number,
): CuratedAsset => ({
  family,
  chainId,
  contract: family === 'evm' ? contract.toLowerCase() : contract,
  currencyCode: code,
  symbol: code,
  name,
  decimals,
});

export const CURATED_ASSETS: readonly CuratedAsset[] = [
  // Bitcoin
  native('bitcoin', null, 'BTC', 'Bitcoin', 8),

  // Ethereum
  native('evm', '1', 'ETH', 'Ether', 18),
  token('evm', '1', '0xdAC17F958D2ee523a2206206994597C13D831ec7', 'USDT', 'Tether', 6),
  token('evm', '1', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'USDC', 'USD Coin', 6),
  token('evm', '1', '0x6B175474E89094C44Da98b954EedeAC495271d0F', 'DAI', 'Dai', 18),
  token('evm', '1', '0x514910771AF9Ca656af840dff83E8264EcF986CA', 'LINK', 'Chainlink', 18),

  // Polygon
  native('evm', '137', 'POL', 'Polygon', 18),
  token('evm', '137', '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', 'USDT', 'Tether', 6),
  token('evm', '137', '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', 'USDC', 'USD Coin', 6),
  token(
    'evm',
    '137',
    '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    'USDC',
    'USD Coin (bridged)',
    6,
  ),
  token('evm', '137', '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', 'DAI', 'Dai', 18),
  token('evm', '137', '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39', 'LINK', 'Chainlink', 18),

  // Arbitrum
  native('evm', '42161', 'ETH', 'Ether', 18),
  token('evm', '42161', '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', 'USDT', 'Tether', 6),
  token('evm', '42161', '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 'USDC', 'USD Coin', 6),
  token('evm', '42161', '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', 'DAI', 'Dai', 18),
  token('evm', '42161', '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', 'LINK', 'Chainlink', 18),

  // BNB Chain (BEP-20 stablecoins use 18 decimals)
  native('evm', '56', 'BNB', 'BNB', 18),
  token('evm', '56', '0x55d398326f99059fF775485246999027B3197955', 'USDT', 'Tether', 18),
  token('evm', '56', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', 'USDC', 'USD Coin', 18),
  token('evm', '56', '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', 'DAI', 'Dai', 18),
  token('evm', '56', '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD', 'LINK', 'Chainlink', 18),

  // OP Mainnet
  native('evm', '10', 'ETH', 'Ether', 18),
  token('evm', '10', '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', 'USDT', 'Tether', 6),
  token('evm', '10', '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', 'USDC', 'USD Coin', 6),
  token('evm', '10', '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', 'DAI', 'Dai', 18),
  token('evm', '10', '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6', 'LINK', 'Chainlink', 18),

  // Base
  native('evm', '8453', 'ETH', 'Ether', 18),
  token('evm', '8453', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'USDC', 'USD Coin', 6),
  token('evm', '8453', '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', 'USDT', 'Tether', 6),
  token('evm', '8453', '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', 'DAI', 'Dai', 18),
  token('evm', '8453', '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196', 'LINK', 'Chainlink', 18),

  // Avalanche C-Chain
  native('evm', '43114', 'AVAX', 'Avalanche', 18),
  token('evm', '43114', '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', 'USDT', 'Tether', 6),
  token('evm', '43114', '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', 'USDC', 'USD Coin', 6),
  token('evm', '43114', '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70', 'DAI', 'Dai (bridged)', 18),
  token(
    'evm',
    '43114',
    '0x5947BB275c521040051D82396192181b413227A3',
    'LINK',
    'Chainlink (bridged)',
    18,
  ),

  // Tron
  native('tron', null, 'TRX', 'TRON', 6),
  token('tron', null, 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 'USDT', 'Tether', 6),
  token('tron', null, 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8', 'USDC', 'USD Coin', 6),

  // Solana
  native('solana', null, 'SOL', 'Solana', 9),
  token('solana', null, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'USDC', 'USD Coin', 6),
  token('solana', null, 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'USDT', 'Tether', 6),
];

const FAMILY_PREFIX: Record<CryptoFamily, string> = {
  evm: 'evm',
  bitcoin: 'btc',
  tron: 'tron',
  solana: 'sol',
};

const normaliseContract = (family: CryptoFamily, contract: string) =>
  family === 'evm' && contract !== 'native' ? contract.toLowerCase() : contract;

/** `evm:137:0x2791…`, `evm:1:native`, `btc:native`, `tron:TR7N…`, `sol:EPjF…`. */
export const assetKeyOf = (family: CryptoFamily, chainId: string | null, contract: string) => {
  const prefix = FAMILY_PREFIX[family];
  const tail = normaliseContract(family, contract);
  return family === 'evm' ? `${prefix}:${chainId}:${tail}` : `${prefix}:${tail}`;
};

export const parseAssetKey = (
  key: string,
): { family: CryptoFamily; chainId: string | null; contract: string } | null => {
  const parts = key.split(':');
  const family = (Object.keys(FAMILY_PREFIX) as CryptoFamily[]).find(
    (f) => FAMILY_PREFIX[f] === parts[0],
  );
  if (!family) return null;
  if (family === 'evm') {
    if (parts.length !== 3) return null;
    return { family, chainId: parts[1], contract: parts[2] };
  }
  if (parts.length !== 2) return null;
  return { family, chainId: null, contract: parts[1] };
};

export const findCuratedAsset = (
  family: CryptoFamily,
  chainId: string | null,
  contract: string,
): CuratedAsset | undefined => {
  const wanted = normaliseContract(family, contract);
  return CURATED_ASSETS.find(
    (a) => a.family === family && a.chainId === chainId && a.contract === wanted,
  );
};

export const curatedForChain = (family: CryptoFamily, chainId: string | null) =>
  CURATED_ASSETS.filter((a) => a.family === family && a.chainId === chainId);

export const evmChainName = (chainId: string | null): string =>
  EVM_CHAINS.find((c) => c.id === chainId)?.name ?? `Chain ${chainId}`;

/** `0x12…abcd` — the only form an address appears in logs and in plain columns. */
export const shortAddress = (address: string): string =>
  address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
