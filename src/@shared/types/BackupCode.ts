import bcrypt from 'bcrypt';
import { randomBackupCodes, safeCompare } from '@shared/utils/secureRandom';

const BCRYPT_ROUNDS = 10;

/**
 * 2FA backup codes.
 *
 * Codes are shown to the user exactly once at generation time and are only
 * ever persisted as bcrypt hashes — a leaked `users.backup_codes` column must
 * not hand an attacker a working second factor.
 *
 * Rows written before hashing was introduced still hold plaintext codes.
 * Those are recognised by the absence of a bcrypt prefix and compared in
 * constant time, so existing users keep working until their codes are next
 * regenerated (or consumed, which clears them).
 */
export class BackupCode {
  private static isHashed(stored: string): boolean {
    return typeof stored === 'string' && stored.startsWith('$2');
  }

  /**
   * Generate a fresh set of codes.
   *
   * @returns `plain` to display to the user once, `hashed` to persist.
   */
  public static async generateSet(count = 8): Promise<{ plain: string[]; hashed: string[] }> {
    const plain = randomBackupCodes(count);
    const hashed = await Promise.all(plain.map((code) => bcrypt.hash(code, BCRYPT_ROUNDS)));

    return { plain, hashed };
  }

  /**
   * Check a user-supplied code against every stored code.
   *
   * All candidates are evaluated rather than short-circuiting, so the time
   * taken does not reveal which position matched.
   */
  public static async matches(candidate: string, stored: string[]): Promise<boolean> {
    if (!candidate || !Array.isArray(stored) || stored.length === 0) {
      return false;
    }

    const results = await Promise.all(
      stored.map((value) =>
        BackupCode.isHashed(value)
          ? bcrypt.compare(candidate, value)
          : Promise.resolve(safeCompare(value, candidate)),
      ),
    );

    return results.some(Boolean);
  }

  /**
   * True when every stored code is already hashed. Used by the migration
   * script to skip users that need no work.
   */
  public static allHashed(stored: string[]): boolean {
    return Array.isArray(stored) && stored.every((value) => BackupCode.isHashed(value));
  }

  /**
   * Hash a set of existing plaintext codes without changing their values,
   * so a migration can upgrade storage in place.
   */
  public static async hashExisting(plain: string[]): Promise<string[]> {
    return Promise.all(
      plain.map((code) =>
        BackupCode.isHashed(code) ? Promise.resolve(code) : bcrypt.hash(code, BCRYPT_ROUNDS),
      ),
    );
  }
}
