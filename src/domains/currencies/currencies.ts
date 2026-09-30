/**
 * Currency registry: every currency an account or a transaction may use.
 *
 * - Fiat: the active ISO 4217 codes (2 decimals, as the apps have always shown).
 * - Crypto: a curated list of ~20 coins (8 decimals). Their rates come from
 *   CoinGecko (see CryptoRateProvider) and are stored as USD -> coin, so the
 *   USD pivot in ExchangeRateService.convert reaches every pair.
 *
 * Offering crypto is gated by the `crypto` feature flag (migration 034); the
 * registry itself is flag-free so existing crypto accounts keep working.
 */

/** The feature flag (GET /api/v1/feature-flags) that offers crypto currencies. */
export const CRYPTO_FLAG = 'crypto';

export type CurrencyKind = 'fiat' | 'crypto';

export interface CryptoCurrency {
  code: string;
  name: string;
  decimals: number;
  /** CoinGecko coin id, e.g. `bitcoin`. */
  coingeckoId: string;
}

/** The major currencies the fiat rate fetch and `GET /exchange-rates/supported` list. */
export const SUPPORTED_FIAT_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CAD',
  'CHF',
  'CNY',
  'INR',
  'MXN',
  'BRL',
  'KRW',
  'SGD',
  'HKD',
  'NOK',
  'SEK',
  'DKK',
  'NZD',
  'ZAR',
  'RUB',
] as const;

/** Active ISO 4217 codes (what exchangerate-api.com quotes). */
export const FIAT_CURRENCIES: readonly string[] = [
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
  'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL',
  'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHF', 'CLP', 'CNY',
  'COP', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP',
  'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD',
  'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HRK', 'HTG', 'HUF', 'IDR', 'ILS',
  'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR',
  'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD',
  'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU',
  'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK',
  'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG',
  'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK',
  'SGD', 'SHP', 'SLE', 'SLL', 'SOS', 'SRD', 'SSP', 'STN', 'SYP', 'SZL',
  'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH',
  'UGX', 'USD', 'UYU', 'UZS', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XCD',
  'XOF', 'XPF', 'YER', 'ZAR', 'ZMW', 'ZWL',
];

export const CRYPTO_CURRENCIES: readonly CryptoCurrency[] = [
  { code: 'BTC', name: 'Bitcoin', decimals: 8, coingeckoId: 'bitcoin' },
  { code: 'ETH', name: 'Ethereum', decimals: 8, coingeckoId: 'ethereum' },
  { code: 'USDT', name: 'Tether', decimals: 8, coingeckoId: 'tether' },
  { code: 'USDC', name: 'USD Coin', decimals: 8, coingeckoId: 'usd-coin' },
  { code: 'BNB', name: 'BNB', decimals: 8, coingeckoId: 'binancecoin' },
  { code: 'SOL', name: 'Solana', decimals: 8, coingeckoId: 'solana' },
  { code: 'XRP', name: 'XRP', decimals: 8, coingeckoId: 'ripple' },
  { code: 'ADA', name: 'Cardano', decimals: 8, coingeckoId: 'cardano' },
  { code: 'DOGE', name: 'Dogecoin', decimals: 8, coingeckoId: 'dogecoin' },
  { code: 'TRX', name: 'TRON', decimals: 8, coingeckoId: 'tron' },
  { code: 'TON', name: 'Toncoin', decimals: 8, coingeckoId: 'the-open-network' },
  { code: 'DOT', name: 'Polkadot', decimals: 8, coingeckoId: 'polkadot' },
  { code: 'POL', name: 'Polygon', decimals: 8, coingeckoId: 'polygon-ecosystem-token' },
  { code: 'LTC', name: 'Litecoin', decimals: 8, coingeckoId: 'litecoin' },
  { code: 'AVAX', name: 'Avalanche', decimals: 8, coingeckoId: 'avalanche-2' },
  { code: 'LINK', name: 'Chainlink', decimals: 8, coingeckoId: 'chainlink' },
  { code: 'BCH', name: 'Bitcoin Cash', decimals: 8, coingeckoId: 'bitcoin-cash' },
  { code: 'XLM', name: 'Stellar', decimals: 8, coingeckoId: 'stellar' },
  { code: 'SHIB', name: 'Shiba Inu', decimals: 8, coingeckoId: 'shiba-inu' },
  { code: 'DAI', name: 'Dai', decimals: 8, coingeckoId: 'dai' },
];

const FIAT_SET: ReadonlySet<string> = new Set(FIAT_CURRENCIES);
const CRYPTO_BY_CODE: ReadonlyMap<string, CryptoCurrency> = new Map(
  CRYPTO_CURRENCIES.map((c) => [c.code, c]),
);

export const FIAT_DECIMALS = 2;

const normalise = (code: string | null | undefined) => String(code ?? '').trim().toUpperCase();

export const isFiat = (code: string | null | undefined): boolean => FIAT_SET.has(normalise(code));

export const isCrypto = (code: string | null | undefined): boolean =>
  CRYPTO_BY_CODE.has(normalise(code));

export const isKnownCurrency = (code: string | null | undefined): boolean =>
  isFiat(code) || isCrypto(code);

export const cryptoByCode = (code: string | null | undefined): CryptoCurrency | undefined =>
  CRYPTO_BY_CODE.get(normalise(code));

export const currencyKind = (code: string | null | undefined): CurrencyKind =>
  isCrypto(code) ? 'crypto' : 'fiat';

/** Decimals stored and shown for a currency: 8 for crypto, 2 otherwise. */
export const decimalsOf = (code: string | null | undefined): number =>
  cryptoByCode(code)?.decimals ?? FIAT_DECIMALS;

/**
 * Rounds to the currency's decimals (half away from zero). The scaled value
 * is trimmed to 15 significant digits first, so float noise doesn't decide
 * the rounding: 1.005 USD rounds to 1.01, 0.123456785 BTC to 0.12345679.
 */
export const roundAmount = (value: number, code: string | null | undefined): number => {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimalsOf(code);
  const scaled = Number((Math.abs(value) * factor).toPrecision(15));
  const rounded = Math.round(scaled) / factor;
  return rounded === 0 ? 0 : Math.sign(value) * rounded;
};
