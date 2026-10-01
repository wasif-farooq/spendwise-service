import { randomBytes } from 'crypto';
import { SecretBox, SecretBoxError, parseKeyring } from '@shared/crypto/secretBox';

const key = () => randomBytes(32).toString('base64');

describe('secretBox', () => {
  const k1 = key();
  const k2 = key();

  it('round-trips and never stores the plaintext', () => {
    const box = SecretBox.fromConfig(`1:${k1}`);
    const sealed = box.encrypt('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
    expect(sealed.includes(Buffer.from('bc1qxy2'))).toBe(false);
    expect(sealed[0]).toBe(1);
    expect(box.decrypt(sealed)).toBe('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
    // A fresh IV each time.
    expect(box.encrypt('x').equals(box.encrypt('x'))).toBe(false);
  });

  it('detects tampering', () => {
    const box = SecretBox.fromConfig(`1:${k1}`);
    const sealed = box.encrypt('secret');
    sealed[sealed.length - 1] ^= 0xff;
    expect(() => box.decrypt(sealed)).toThrow(SecretBoxError);
    const tag = box.encrypt('secret');
    tag[20] ^= 0x01;
    expect(() => box.decrypt(tag)).toThrow('failed authentication');
    expect(() => box.decrypt(Buffer.alloc(5))).toThrow('too short');
  });

  it('rotates keys: old values still open, new ones use the active key', () => {
    const old = SecretBox.fromConfig(`1:${k1}`);
    const sealed = old.encrypt('0x4f2a');
    const rotated = SecretBox.fromConfig(`1:${k1},2:${k2}`, '2');
    expect(rotated.decrypt(sealed)).toBe('0x4f2a');
    expect(rotated.needsRotation(sealed)).toBe(true);
    const resealed = rotated.encrypt(rotated.decrypt(sealed));
    expect(resealed[0]).toBe(2);
    expect(rotated.needsRotation(resealed)).toBe(false);
    // Without key 1 the old value can't be read.
    expect(() => SecretBox.fromConfig(`2:${k2}`).decrypt(sealed)).toThrow('No key for version 1');
  });

  it('keeps the blind index stable across rotation and hides the value', () => {
    const before = SecretBox.fromConfig(`1:${k1}`).blindIndex('crypto:bitcoin:bc1q');
    const after = SecretBox.fromConfig(`1:${k1},2:${k2}`, 2).blindIndex('crypto:bitcoin:bc1q');
    expect(after).toBe(before);
    expect(before).toMatch(/^[0-9a-f]{64}$/);
    expect(SecretBox.fromConfig(`1:${k2}`).blindIndex('crypto:bitcoin:bc1q')).not.toBe(before);
  });

  it('validates the keyring', () => {
    expect(() => parseKeyring('')).toThrow('No encryption keys');
    expect(() => parseKeyring('1:short')).toThrow('32 bytes');
    expect(() => parseKeyring(`x:${k1}`)).toThrow();
    expect(() => parseKeyring(`1:${k1}`, '3')).toThrow('not one of the configured keys');
    expect(parseKeyring(`1:${k1},4:${k2}`).active).toBe(4);
  });
});
