import { z } from 'zod';
import { isKnownCurrency } from './currencies';

const CODE_SHAPE = /^[A-Z]{3,10}$/;

/**
 * An account or transaction currency: 3–10 letters, upper-cased, and either
 * a known fiat code or one of CRYPTO_CURRENCIES. (It was `.length(3)`, which
 * rejected USDT, USDC and DOGE.) Whether crypto may be *offered* is the
 * `crypto` flag's call, see requireCryptoFlagForCurrency.
 */
export const currencyCode = (message = 'Unsupported currency') =>
  z
    .string()
    .trim()
    .transform((code) => code.toUpperCase())
    .refine((code) => CODE_SHAPE.test(code) && isKnownCurrency(code), { message });
