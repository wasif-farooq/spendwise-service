import crypto from 'crypto';

/**
 * Cryptographically secure primitives for auth codes and secrets.
 *
 * Math.random() must never be used for anything a user has to prove knowledge
 * of: V8's PRNG state is recoverable from a handful of observed outputs, so an
 * attacker who can request their own codes can predict other users' codes.
 */

/**
 * Generate a numeric code of exactly `length` digits, uniformly distributed
 * (leading zeros are possible and preserved).
 */
export const randomDigits = (length: number): string => {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += crypto.randomInt(0, 10).toString();
  }
  return out;
};

/**
 * Generate a single 2FA backup code: 8 digits, matching the length the API
 * contract and validators expect.
 */
export const randomBackupCode = (): string => randomDigits(8);

/**
 * Generate `count` backup codes.
 */
export const randomBackupCodes = (count = 8): string[] =>
  Array.from({ length: count }, () => randomBackupCode());

/**
 * Generate an opaque, unguessable token (URL-safe base64).
 */
export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString('base64url');

/**
 * Constant-time string comparison.
 *
 * Both sides are hashed first so that inputs of differing length can be
 * compared without timingSafeEqual throwing, and so length itself does not
 * leak through timing.
 */
export const safeCompare = (
  a: string | undefined | null,
  b: string | undefined | null,
): boolean => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const digestA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const digestB = crypto.createHash('sha256').update(b, 'utf8').digest();

  return crypto.timingSafeEqual(digestA, digestB);
};
