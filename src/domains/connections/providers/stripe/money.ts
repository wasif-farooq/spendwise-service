import { toDecimalString } from '../decimal';

/**
 * Stripe reports amounts as integers in the currency's smallest unit. Most
 * currencies have two decimals; these are the exceptions in Stripe's API.
 * ISK and UGX are not listed on purpose: Stripe still expresses them with two
 * decimals for backwards compatibility, like HUF and TWD.
 */
const ZERO_DECIMAL = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);
const THREE_DECIMAL = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND']);

export const stripeDecimals = (currency: string): number => {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
};

/** Smallest-unit integer → exact decimal string (signed). */
export const stripeAmount = (amount: number | string | bigint, currency: string): string =>
  toDecimalString(amount, stripeDecimals(currency));
