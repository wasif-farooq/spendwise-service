/**
 * Exact decimal handling for provider amounts. Chains report integers in their
 * smallest unit (wei, satoshi, lamport, sun) that don't fit a float, so they
 * are converted with bigint arithmetic only, never through `number`.
 *
 * The ledger stores 8 decimals (NUMERIC(24,8)); `toUnits` scales a decimal
 * string to that precision as a bigint (half away from zero), so balances can
 * be compared and summed exactly.
 */

export const LEDGER_DECIMALS = 8;
const LEDGER_SCALE = 10n ** BigInt(LEDGER_DECIMALS);

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** raw integer (string | bigint) in the smallest unit → exact decimal string, trailing zeros trimmed. */
export const toDecimalString = (raw: bigint | string | number, decimals: number): string => {
  let value: bigint;
  if (typeof raw === 'bigint') value = raw;
  else if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw)) throw new RangeError(`Unsafe integer amount: ${raw}`);
    value = BigInt(raw);
  } else {
    const trimmed = raw.trim();
    if (!/^-?\d+$/.test(trimmed)) throw new RangeError(`Not an integer amount: ${raw}`);
    value = BigInt(trimmed);
  }
  if (!Number.isInteger(decimals) || decimals < 0) throw new RangeError('Bad decimals');

  const negative = value < 0n;
  const abs = negative ? -value : value;
  const digits = abs.toString().padStart(decimals + 1, '0');
  const whole = decimals === 0 ? digits : digits.slice(0, -decimals);
  const fraction = decimals === 0 ? '' : digits.slice(-decimals).replace(/0+$/, '');
  const out = fraction ? `${whole}.${fraction}` : whole;
  return negative && out !== '0' ? `-${out}` : out;
};

/** Decimal string → bigint at 8 decimals, rounded half away from zero. */
export const toUnits = (decimal: string | number): bigint => {
  const text = typeof decimal === 'number' ? numberToPlain(decimal) : String(decimal).trim();
  if (!DECIMAL_RE.test(text)) throw new RangeError(`Not a decimal amount: ${decimal}`);
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const kept = fraction.slice(0, LEDGER_DECIMALS).padEnd(LEDGER_DECIMALS, '0');
  let units = BigInt(whole) * LEDGER_SCALE + BigInt(kept);
  const next = fraction.charAt(LEDGER_DECIMALS);
  if (next && Number(next) >= 5) units += 1n;
  return negative ? -units : units;
};

/** bigint at 8 decimals → fixed decimal string ("1.50000000"). */
export const fromUnits = (units: bigint): string => {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / LEDGER_SCALE;
  const fraction = (abs % LEDGER_SCALE).toString().padStart(LEDGER_DECIMALS, '0');
  return `${negative && abs !== 0n ? '-' : ''}${whole}.${fraction}`;
};

/** Raw smallest-unit integer → ledger units (8 decimals). */
export const rawToUnits = (raw: bigint | string | number, decimals: number): bigint =>
  toUnits(toDecimalString(raw, decimals));

export const absUnits = (units: bigint): bigint => (units < 0n ? -units : units);

/** Dust below which a balance gap is ignored: 1e-8 for crypto, 0.01 for fiat. */
export const dustUnits = (kind: 'crypto' | 'fiat'): bigint =>
  kind === 'crypto' ? 1n : 10n ** BigInt(LEDGER_DECIMALS - 2);

const numberToPlain = (value: number): string => {
  if (!Number.isFinite(value)) throw new RangeError(`Not a finite amount: ${value}`);
  // toFixed avoids exponent notation for the magnitudes the ledger holds.
  return value.toFixed(LEDGER_DECIMALS + 2);
};
