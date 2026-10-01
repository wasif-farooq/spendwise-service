import { CRYPTO_CURRENCIES } from '@domains/currencies/currencies';
import {
  CURATED_ASSETS,
  EVM_CHAINS,
  assetKeyOf,
  findCuratedAsset,
  parseAssetKey,
  shortAddress,
} from '@domains/connections/providers/crypto/assets';
import { CHAIN_ADAPTERS } from '@domains/connections/providers/crypto/chains';
import { ProviderRegistry } from '@domains/connections/providers/ProviderRegistry';

describe('curated crypto assets', () => {
  it('maps only to currencies in the curated currency list', () => {
    const codes = new Set(CRYPTO_CURRENCIES.map((c) => c.code));
    for (const asset of CURATED_ASSETS) expect(codes.has(asset.currencyCode)).toBe(true);
  });

  it('covers USDT and USDC on every chain and each native coin', () => {
    for (const chain of EVM_CHAINS) {
      const codes = CURATED_ASSETS.filter((a) => a.family === 'evm' && a.chainId === chain.id).map(
        (a) => a.currencyCode,
      );
      expect(codes).toEqual(expect.arrayContaining(['USDT', 'USDC', chain.nativeCurrency]));
    }
    for (const family of ['bitcoin', 'tron', 'solana'] as const) {
      expect(findCuratedAsset(family, null, 'native')).toBeDefined();
    }
  });

  it('has no duplicate asset keys', () => {
    const keys = CURATED_ASSETS.map((a) => assetKeyOf(a.family, a.chainId, a.contract));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('round-trips asset keys and lower-cases EVM contracts', () => {
    const key = assetKeyOf('evm', '137', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174');
    expect(key).toBe('evm:137:0x2791bca1f2de4661ed88a30c99a7a9449aa84174');
    expect(parseAssetKey(key)).toEqual({
      family: 'evm',
      chainId: '137',
      contract: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
    });
    expect(parseAssetKey('btc:native')).toEqual({ family: 'bitcoin', chainId: null, contract: 'native' });
    expect(parseAssetKey('nope:x')).toBeNull();
    expect(findCuratedAsset('evm', '137', '0x2791BCA1F2DE4661ED88A30C99A7A9449AA84174')?.decimals).toBe(6);
  });

  it('shortens addresses for logs and plain columns', () => {
    expect(shortAddress('0x4f2a00000000000000000000000000000000009c1e')).toBe('0x4f2a…9c1e');
  });

  it('registers one provider per chain adapter (one file + one line)', () => {
    const registry = ProviderRegistry.fromConfig({});
    expect(registry.list().map((p) => p.id)).toEqual([
      'crypto:evm',
      'crypto:bitcoin',
      'crypto:tron',
      'crypto:solana',
    ]);
    expect(CHAIN_ADAPTERS).toHaveLength(4);
    const described = registry.describe();
    expect(described.find((p) => p.id === 'crypto:evm')?.available).toBe(false);
    expect(described.find((p) => p.id === 'stripe')).toMatchObject({ comingSoon: true, requiresPaidPlan: true });
    // Paid-tier chains stay hidden without ETHERSCAN_PAID_PLAN.
    expect(described.find((p) => p.id === 'crypto:evm')?.chains.map((c) => c.id)).toEqual([
      '1',
      '137',
      '42161',
    ]);
  });
});
