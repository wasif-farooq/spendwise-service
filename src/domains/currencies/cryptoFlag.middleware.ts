import { Request, RequestHandler } from 'express';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import type { DatabaseFacade } from '@facades/DatabaseFacade';
import type { FeatureFlagService } from '@domains/feature-flags/services/FeatureFlagService';
import { CRYPTO_FLAG, isCrypto } from './currencies';

export { CRYPTO_FLAG };

export const CURRENCY_NOT_SUPPORTED = 'CURRENCY_NOT_SUPPORTED';

/**
 * Where a request carries currencies: the body fields to check, and the
 * currency already in place (the account's), which stays allowed so existing
 * crypto accounts keep working while the flag is off.
 */
export interface CryptoGateOptions {
  fields?: string[];
  existingCurrency?: (req: Request) => Promise<string | null | undefined>;
}

/**
 * 400 CURRENCY_NOT_SUPPORTED when the body asks for a crypto currency while
 * the `crypto` flag is off. Runs after validateBody (codes are upper-cased).
 * Fiat requests never read the flag. A failed flag lookup counts as off; a
 * failed lookup of the existing currency counts as "no existing currency".
 */
export const requireCryptoFlagForCurrency =
  (isEnabled: () => Promise<boolean>, options: CryptoGateOptions = {}): RequestHandler =>
  async (req, res, next) => {
    const fields = options.fields ?? ['currency'];
    const requested = fields
      .map((field) => req.body?.[field])
      .filter((code): code is string => typeof code === 'string' && isCrypto(code));
    if (requested.length === 0) return next();

    let enabled = false;
    try {
      enabled = await isEnabled();
    } catch {
      enabled = false;
    }
    if (enabled) return next();

    let existing: string | null | undefined;
    try {
      existing = await options.existingCurrency?.(req);
    } catch {
      existing = null;
    }
    const blocked = requested.find((code) => code !== existing?.toUpperCase());
    if (!blocked) return next();

    res.status(400).json({
      message: `${blocked} is not available as a currency.`,
      code: CURRENCY_NOT_SUPPORTED,
    });
  };

/** Reads the flag through the FeatureFlagService, resolved on first use. */
export const isCryptoFlagOn = async (): Promise<boolean> => {
  const flags = Container.getInstance().resolve<FeatureFlagService>(TOKENS.FeatureFlagService);
  return flags.isEnabled(CRYPTO_FLAG);
};

/** The currency of `accounts.id = <id>` in `workspaceId`, or null. */
export const accountCurrencyLookup =
  (idOf: (req: Request) => string | undefined): CryptoGateOptions['existingCurrency'] =>
  async (req) => {
    const id = idOf(req);
    const workspaceId = req.params.workspaceId;
    if (!id || !workspaceId) return null;
    const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
    const result = await db.query(
      'SELECT currency FROM accounts WHERE id = $1 AND workspace_id = $2',
      [id, workspaceId],
    );
    return result.rows[0]?.currency ?? null;
  };

/**
 * The user's base (preference) currency stays fiat: totals are converted
 * into it and shown with 2 decimals. 400 CURRENCY_NOT_SUPPORTED otherwise.
 */
export const rejectCryptoBaseCurrency: RequestHandler = (req, res, next) => {
  const code = req.body?.currency;
  if (typeof code === 'string' && isCrypto(code)) {
    res.status(400).json({
      message: 'The default currency must be a fiat currency.',
      code: CURRENCY_NOT_SUPPORTED,
    });
    return;
  }
  next();
};
