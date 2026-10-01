import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'crypto';

/**
 * At-rest encryption for connection secrets (OAuth tokens, wallet addresses).
 *
 * AES-256-GCM, stored as one buffer: [version 1 B][iv 12 B][tag 16 B][ciphertext].
 * The version byte names the key, so keys can be rotated: add a new key, make
 * it active, run `connections.cli.ts rotate-keys`, then drop the old one.
 *
 * Keys come from config (`connections.encryption`):
 *   CONNECTIONS_ENC_KEYS    "1:<base64 32 bytes>,2:<base64 32 bytes>"
 *   CONNECTIONS_ENC_ACTIVE  the version new values are written with (default: highest)
 *
 * `blindIndex` gives a keyed hash for uniqueness checks (the same wallet can't
 * be connected twice) without storing the value in clear. It is keyed by the
 * lowest key version, so that key must be kept while connections exist.
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const HEADER_BYTES = 1 + IV_BYTES + TAG_BYTES;

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

export interface SecretBoxKeys {
  keys: Map<number, Buffer>;
  active: number;
}

/** Parses "1:<b64>,2:<b64>". Throws on a malformed entry or a key that isn't 32 bytes. */
export const parseKeyring = (raw: string | undefined, active?: string | number): SecretBoxKeys => {
  const keys = new Map<number, Buffer>();
  for (const entry of String(raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)) {
    const separator = entry.indexOf(':');
    const version = Number(entry.slice(0, separator));
    if (separator < 1 || !Number.isInteger(version) || version < 1 || version > 255) {
      throw new SecretBoxError('CONNECTIONS_ENC_KEYS entries must look like "<1-255>:<base64 key>"');
    }
    const key = Buffer.from(entry.slice(separator + 1), 'base64');
    if (key.length !== KEY_BYTES) {
      throw new SecretBoxError(`Key ${version} must be ${KEY_BYTES} bytes (base64)`);
    }
    keys.set(version, key);
  }
  if (keys.size === 0) throw new SecretBoxError('No encryption keys configured');

  const wanted =
    active === undefined || active === '' ? Math.max(...keys.keys()) : Number(active);
  if (!keys.has(wanted)) {
    throw new SecretBoxError(`CONNECTIONS_ENC_ACTIVE=${active} is not one of the configured keys`);
  }
  return { keys, active: wanted };
};

export class SecretBox {
  private readonly indexKey: Buffer;

  constructor(private readonly keyring: SecretBoxKeys) {
    const lowest = Math.min(...keyring.keys.keys());
    this.indexKey = Buffer.from(
      hkdfSync('sha256', keyring.keys.get(lowest)!, Buffer.alloc(0), 'connections-index', 32),
    );
  }

  static fromConfig(raw: string | undefined, active?: string | number): SecretBox {
    return new SecretBox(parseKeyring(raw, active));
  }

  get activeVersion(): number {
    return this.keyring.active;
  }

  encrypt(plaintext: string): Buffer {
    const version = this.keyring.active;
    const key = this.keyring.keys.get(version)!;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([version]), iv, cipher.getAuthTag(), ciphertext]);
  }

  decrypt(box: Buffer): string {
    if (!Buffer.isBuffer(box) || box.length < HEADER_BYTES) {
      throw new SecretBoxError('Encrypted value is too short');
    }
    const version = box[0];
    const key = this.keyring.keys.get(version);
    if (!key) throw new SecretBoxError(`No key for version ${version}`);
    const iv = box.subarray(1, 1 + IV_BYTES);
    const tag = box.subarray(1 + IV_BYTES, HEADER_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(box.subarray(HEADER_BYTES)), decipher.final()]).toString(
        'utf8',
      );
    } catch {
      throw new SecretBoxError('Encrypted value failed authentication');
    }
  }

  /** The key version a stored value was written with. */
  versionOf(box: Buffer): number {
    return box[0];
  }

  /** True when the value was written with an older key and should be re-encrypted. */
  needsRotation(box: Buffer): boolean {
    return this.versionOf(box) !== this.keyring.active;
  }

  /** Keyed hash (hex) for uniqueness checks; stable across key rotation. */
  blindIndex(value: string): string {
    return createHmac('sha256', this.indexKey).update(value, 'utf8').digest('hex');
  }
}
