import jwt from 'jsonwebtoken';
import { ConfigLoader } from '@config/ConfigLoader';
import { AppError } from '@shared/errors/AppError';

/**
 * Short-lived token proving a user has completed the *first* factor (password
 * or Google OAuth) and is mid-way through the 2FA challenge.
 *
 * This must not be guessable or derivable from public data. It is signed with
 * the JWT secret and scoped with an explicit purpose so it can never be
 * replayed against endpoints that expect an access token.
 */

const TWO_FACTOR_PURPOSE = '2fa_pending';
const TWO_FACTOR_TTL = '5m';

export const issueTwoFactorTempToken = (userId: string): string => {
  const secret = ConfigLoader.getInstance().get('auth.jwt.secret');
  if (!secret) {
    throw new AppError('Authentication is not configured', 500);
  }

  return jwt.sign({ sub: userId, purpose: TWO_FACTOR_PURPOSE }, secret, {
    expiresIn: TWO_FACTOR_TTL,
  });
};

/**
 * Resolve a temp token back to the user id it was issued for.
 * Throws if the token is missing, forged, expired, or of the wrong purpose.
 */
export const resolveTwoFactorTempToken = (tempToken: string): string => {
  const secret = ConfigLoader.getInstance().get('auth.jwt.secret');
  if (!secret) {
    throw new AppError('Authentication is not configured', 500);
  }

  let payload: any;
  try {
    payload = jwt.verify(tempToken, secret);
  } catch {
    throw new AppError('Invalid or expired two-factor session', 401);
  }

  if (payload?.purpose !== TWO_FACTOR_PURPOSE || typeof payload?.sub !== 'string') {
    throw new AppError('Invalid or expired two-factor session', 401);
  }

  return payload.sub;
};

export const TWO_FACTOR_TOKEN_PURPOSE = TWO_FACTOR_PURPOSE;
