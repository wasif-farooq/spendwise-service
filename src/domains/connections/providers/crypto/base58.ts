import { createHash } from 'crypto';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const INDEX = new Map([...ALPHABET].map((c, i) => [c, BigInt(i)]));

/** Base58 (Bitcoin alphabet) → bytes; null when a character is outside the alphabet. */
export const base58Decode = (text: string): Buffer | null => {
  if (!text) return null;
  let value = 0n;
  for (const char of text) {
    const digit = INDEX.get(char);
    if (digit === undefined) return null;
    value = value * 58n + digit;
  }
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const body = value === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex');
  let zeros = 0;
  while (zeros < text.length && text[zeros] === '1') zeros++;
  return Buffer.concat([Buffer.alloc(zeros), body]);
};

export const base58Encode = (bytes: Buffer): string => {
  let value = BigInt(`0x${bytes.toString('hex') || '0'}`);
  let out = '';
  while (value > 0n) {
    out = ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = `1${out}`;
  }
  return out;
};

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest();

/** Base58Check payload (version byte included), or null when the checksum fails. */
export const base58CheckDecode = (text: string): Buffer | null => {
  const raw = base58Decode(text);
  if (!raw || raw.length < 5) return null;
  const payload = raw.subarray(0, -4);
  const checksum = raw.subarray(-4);
  const expected = sha256(sha256(payload)).subarray(0, 4);
  return checksum.equals(expected) ? payload : null;
};

export const base58CheckEncode = (payload: Buffer): string =>
  base58Encode(Buffer.concat([payload, sha256(sha256(payload)).subarray(0, 4)]));
