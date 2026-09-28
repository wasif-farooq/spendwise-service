import crypto from 'crypto';
import { randomToken } from '@shared/utils/secureRandom';

/**
 * One-time handoff codes let a signed-in native client open the web app
 * already signed in (for example to reach the Paddle checkout) without ever
 * putting a token in a URL.
 *
 * - The code is 256 bits from the CSPRNG (43 URL-safe characters), so guessing
 *   one inside its 60 second life is not a realistic attack.
 * - Only a SHA-256 of the code is stored, so a Redis dump or MONITOR stream
 *   does not reveal a usable code.
 * - Exchange reads and deletes the key in one GETDEL, so two concurrent
 *   exchanges of the same code cannot both succeed.
 */

export const HANDOFF_TTL_SECONDS = 60;
export const HANDOFF_CODE_BYTES = 32;

export const HANDOFF_SCOPES = ['checkout'] as const;
export type HandoffScope = (typeof HANDOFF_SCOPES)[number];

/** Stored under the hashed code; never contains the code itself. */
export interface HandoffRecord {
  userId: string;
  scope: HandoffScope;
  issuedAt: number;
}

/** Single message for every failed exchange, so callers learn nothing. */
export const HANDOFF_INVALID_MESSAGE = 'Invalid or expired handoff code';

const KEY_PREFIX = 'auth_handoff:';

export const generateHandoffCode = (): string => randomToken(HANDOFF_CODE_BYTES);

export const hashHandoffCode = (code: string): string =>
  crypto.createHash('sha256').update(code, 'utf8').digest('hex');

export const handoffKey = (code: string): string => `${KEY_PREFIX}${hashHandoffCode(code)}`;

export const isHandoffScope = (value: unknown): value is HandoffScope =>
  typeof value === 'string' && (HANDOFF_SCOPES as readonly string[]).includes(value);

/** Parse a stored record, rejecting anything malformed. */
export const parseHandoffRecord = (raw: string | null | undefined): HandoffRecord | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.userId !== 'string' ||
      !isHandoffScope(parsed.scope) ||
      typeof parsed.issuedAt !== 'number'
    ) {
      return null;
    }
    return { userId: parsed.userId, scope: parsed.scope, issuedAt: parsed.issuedAt };
  } catch {
    return null;
  }
};
