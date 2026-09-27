import { AuthService } from '@domains/auth/services/AuthService';
import {
  issueTwoFactorTempToken,
  resolveTwoFactorTempToken,
} from '@domains/auth/services/TwoFactorTempToken';
import { User } from '@domains/auth/models/User';
import { AppError } from '@shared/errors/AppError';
import { randomDigits, randomBackupCodes, safeCompare } from '@shared/utils/secureRandom';
import { BackupCode } from '@shared/types/BackupCode';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'unit-test-secret';

jest.mock('@config/ConfigLoader', () => ({
  ConfigLoader: {
    getInstance: () => ({
      get: (key: string) => {
        const values: Record<string, any> = {
          'auth.jwt.secret': 'unit-test-secret',
          'auth.jwt.accessTokenExpiry': '15m',
          'auth.jwt.refreshTokenExpiry': '7d',
        };
        return values[key];
      },
    }),
  },
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';

const buildUser = (overrides: Partial<any> = {}): User =>
  User.restore(
    {
      email: 'user@example.com',
      isActive: true,
      status: 'active',
      role: 'pro' as any,
      createdAt: new Date(),
      updatedAt: new Date(),
      twoFactorEnabled: true,
      twoFactorMethod: 'email',
      twoFactorMethods: [{ type: 'email', verified: true }],
      backupCodes: ['12345678', '87654321'],
      ...overrides,
    } as any,
    USER_ID,
  );

const mockCache = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
});

const buildService = (user: User | null, cache?: any) => {
  const userRepo = {
    findById: jest.fn().mockResolvedValue(user),
    findByEmail: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  };

  const service = new AuthService(
    {} as any,
    userRepo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    cache,
  );

  return { service, userRepo };
};

describe('secureRandom', () => {
  it('generates codes of the requested length', () => {
    for (let i = 0; i < 50; i++) {
      expect(randomDigits(6)).toMatch(/^\d{6}$/);
    }
  });

  it('generates 8 backup codes of 8 digits each', () => {
    const codes = randomBackupCodes(8);
    expect(codes).toHaveLength(8);
    codes.forEach((code) => expect(code).toMatch(/^\d{8}$/));
  });

  it('does not repeat codes across calls', () => {
    const codes = new Set(Array.from({ length: 200 }, () => randomDigits(6)));
    // Collisions are possible but 200 draws from 10^6 should stay near-unique.
    expect(codes.size).toBeGreaterThan(190);
  });

  it('compares safely, including mismatched lengths', () => {
    expect(safeCompare('123456', '123456')).toBe(true);
    expect(safeCompare('123456', '123457')).toBe(false);
    expect(safeCompare('123456', 'short')).toBe(false);
    expect(safeCompare(undefined, '123456')).toBe(false);
    expect(safeCompare('123456', null)).toBe(false);
  });
});

describe('two-factor temp token', () => {
  it('is not the user id', () => {
    const token = issueTwoFactorTempToken(USER_ID);
    expect(token).not.toBe(USER_ID);
    expect(token.split('.')).toHaveLength(3);
  });

  it('round-trips to the user it was issued for', () => {
    expect(resolveTwoFactorTempToken(issueTwoFactorTempToken(USER_ID))).toBe(USER_ID);
  });

  it('rejects a bare user id', () => {
    expect(() => resolveTwoFactorTempToken(USER_ID)).toThrow(AppError);
  });

  it('rejects a token signed with a different secret', () => {
    const forged = jwt.sign({ sub: USER_ID, purpose: '2fa_pending' }, 'wrong-secret');
    expect(() => resolveTwoFactorTempToken(forged)).toThrow(AppError);
  });

  it('rejects a token issued for a different purpose', () => {
    const accessToken = jwt.sign({ userId: USER_ID, purpose: 'access' }, JWT_SECRET);
    expect(() => resolveTwoFactorTempToken(accessToken)).toThrow(AppError);
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ sub: USER_ID, purpose: '2fa_pending' }, JWT_SECRET, {
      expiresIn: '-1s',
    });
    expect(() => resolveTwoFactorTempToken(expired)).toThrow(AppError);
  });
});

describe('AuthService.verify2FA', () => {
  it('refuses a raw user id as the temp token', async () => {
    const { service, userRepo } = buildService(buildUser(), mockCache());

    await expect(service.verify2FA(USER_ID, '123456', 'email')).rejects.toThrow(
      'Invalid or expired two-factor session',
    );
    // The user is never even looked up — the session is rejected first.
    expect(userRepo.findById).not.toHaveBeenCalled();
  });

  it('does not accept the hardcoded 123456 when the cache is unavailable', async () => {
    const { service } = buildService(buildUser(), undefined);
    const tempToken = issueTwoFactorTempToken(USER_ID);

    await expect(service.verify2FA(tempToken, '123456', 'email')).rejects.toThrow(
      'Two-factor verification is temporarily unavailable',
    );
  });

  it('rejects a code that does not match the cached one', async () => {
    const cache = mockCache();
    cache.get.mockImplementation(async (key: string) =>
      key.startsWith('2fa_attempts:') ? null : '654321',
    );
    const { service } = buildService(buildUser(), cache);

    await expect(
      service.verify2FA(issueTwoFactorTempToken(USER_ID), '123456', 'email'),
    ).rejects.toThrow('Invalid code');
    expect(cache.del).not.toHaveBeenCalled();
  });

  it('issues tokens and consumes the code on success', async () => {
    const cache = mockCache();
    cache.get.mockImplementation(async (key: string) =>
      key.startsWith('2fa_attempts:') ? null : '654321',
    );
    const { service } = buildService(buildUser(), cache);

    const result = await service.verify2FA(issueTwoFactorTempToken(USER_ID), '654321', 'email');

    expect(result.token).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(cache.del).toHaveBeenCalledWith(`2fa_login:${USER_ID}:email`);
  });

  it('routes to the backup-code path when the flag is set', async () => {
    const cache = mockCache();
    const { service, userRepo } = buildService(buildUser(), cache);

    const result = await service.verify2FA(
      issueTwoFactorTempToken(USER_ID),
      '12345678',
      'email',
      true,
    );

    expect(result.token).toBeDefined();
    // Backup-code use disables 2FA entirely, per the documented requirement.
    expect(userRepo.save).toHaveBeenCalled();
  });
});

describe('BackupCode', () => {
  it('never returns the plaintext codes as the stored value', async () => {
    const { plain, hashed } = await BackupCode.generateSet(3);

    expect(plain).toHaveLength(3);
    expect(hashed).toHaveLength(3);
    plain.forEach((code) => {
      expect(code).toMatch(/^\d{8}$/);
      expect(hashed).not.toContain(code);
    });
    hashed.forEach((hash) => expect(hash.startsWith('$2')).toBe(true));
  });

  it('matches a code against its hash', async () => {
    const { plain, hashed } = await BackupCode.generateSet(4);

    await expect(BackupCode.matches(plain[2], hashed)).resolves.toBe(true);
    await expect(BackupCode.matches('00000000', hashed)).resolves.toBe(false);
  });

  it('still accepts legacy plaintext codes', async () => {
    await expect(BackupCode.matches('12345678', ['12345678', '87654321'])).resolves.toBe(true);
    await expect(BackupCode.matches('11111111', ['12345678'])).resolves.toBe(false);
  });

  it('handles a mix of hashed and legacy plaintext codes', async () => {
    const { plain, hashed } = await BackupCode.generateSet(1);
    const mixed = [...hashed, '99999999'];

    await expect(BackupCode.matches(plain[0], mixed)).resolves.toBe(true);
    await expect(BackupCode.matches('99999999', mixed)).resolves.toBe(true);
    await expect(BackupCode.matches('12121212', mixed)).resolves.toBe(false);
  });

  it('rejects empty input', async () => {
    await expect(BackupCode.matches('', ['12345678'])).resolves.toBe(false);
    await expect(BackupCode.matches('12345678', [])).resolves.toBe(false);
  });

  it('reports whether a stored set is fully hashed', async () => {
    const { hashed } = await BackupCode.generateSet(2);

    expect(BackupCode.allHashed(hashed)).toBe(true);
    expect(BackupCode.allHashed(['12345678'])).toBe(false);
    expect(BackupCode.allHashed([...hashed, '12345678'])).toBe(false);
  });

  it('hashes existing codes in place, leaving already-hashed ones alone', async () => {
    const { hashed } = await BackupCode.generateSet(1);
    const upgraded = await BackupCode.hashExisting([...hashed, '12345678']);

    expect(upgraded[0]).toBe(hashed[0]);
    expect(upgraded[1]).not.toBe('12345678');
    await expect(BackupCode.matches('12345678', upgraded)).resolves.toBe(true);
  });
});

describe('AuthService 2FA attempt throttling', () => {
  it('locks the challenge after too many failed guesses', async () => {
    const cache = mockCache();
    cache.get.mockImplementation(async (key: string) =>
      key.startsWith('2fa_attempts:') ? '5' : '654321',
    );
    const { service } = buildService(buildUser(), cache);

    await expect(
      service.verify2FA(issueTwoFactorTempToken(USER_ID), '654321', 'email'),
    ).rejects.toThrow('Too many attempts');
  });

  it('counts up failed guesses', async () => {
    const cache = mockCache();
    cache.get.mockImplementation(async (key: string) =>
      key.startsWith('2fa_attempts:') ? '2' : '654321',
    );
    const { service } = buildService(buildUser(), cache);

    await expect(
      service.verify2FA(issueTwoFactorTempToken(USER_ID), '000000', 'email'),
    ).rejects.toThrow('Invalid code');

    expect(cache.set).toHaveBeenCalledWith(`2fa_attempts:${USER_ID}`, '3', { EX: 900 });
  });

  it('clears the counter on success', async () => {
    const cache = mockCache();
    cache.get.mockImplementation(async (key: string) =>
      key.startsWith('2fa_attempts:') ? '2' : '654321',
    );
    const { service } = buildService(buildUser(), cache);

    await service.verify2FA(issueTwoFactorTempToken(USER_ID), '654321', 'email');

    expect(cache.del).toHaveBeenCalledWith(`2fa_attempts:${USER_ID}`);
  });

  it('throttles backup codes too', async () => {
    const cache = mockCache();
    cache.get.mockResolvedValue('5');
    const { service } = buildService(buildUser(), cache);

    await expect(
      service.verifyBackupCode(issueTwoFactorTempToken(USER_ID), '87654321'),
    ).rejects.toThrow('Too many attempts');
  });
});

describe('AuthService.verifyBackupCode', () => {
  it('refuses a raw user id as the temp token', async () => {
    const { service } = buildService(buildUser(), mockCache());

    await expect(service.verifyBackupCode(USER_ID, '12345678')).rejects.toThrow(
      'Invalid or expired two-factor session',
    );
  });

  it('rejects an unknown backup code', async () => {
    const { service } = buildService(buildUser(), mockCache());

    await expect(
      service.verifyBackupCode(issueTwoFactorTempToken(USER_ID), '00000000'),
    ).rejects.toThrow('Invalid backup code');
  });

  it('accepts a legacy plaintext backup code', async () => {
    const { service } = buildService(buildUser(), mockCache());

    const result = await service.verifyBackupCode(issueTwoFactorTempToken(USER_ID), '87654321');
    expect(result.token).toBeDefined();
  });

  it('accepts a code whose stored form is hashed', async () => {
    const { plain, hashed } = await BackupCode.generateSet(4);
    const { service } = buildService(buildUser({ backupCodes: hashed }), mockCache());

    const result = await service.verifyBackupCode(issueTwoFactorTempToken(USER_ID), plain[1]);
    expect(result.token).toBeDefined();
  });

  it('rejects a code that only matches another user hash set', async () => {
    const { hashed } = await BackupCode.generateSet(4);
    const other = await BackupCode.generateSet(4);
    const { service } = buildService(buildUser({ backupCodes: hashed }), mockCache());

    await expect(
      service.verifyBackupCode(issueTwoFactorTempToken(USER_ID), other.plain[0]),
    ).rejects.toThrow('Invalid backup code');
  });
});

describe('AuthService.regenerateBackupCodes', () => {
  it('returns plaintext to the caller but stores only hashes', async () => {
    const user = buildUser();
    const { service, userRepo } = buildService(user, mockCache());

    const returned = await service.regenerateBackupCodes(USER_ID);

    expect(returned).toHaveLength(8);
    returned.forEach((code) => expect(code).toMatch(/^\d{8}$/));

    expect(userRepo.save).toHaveBeenCalled();
    const stored = user.backupCodes;
    expect(stored).toHaveLength(8);
    stored.forEach((value) => expect(value.startsWith('$2')).toBe(true));
    returned.forEach((code) => expect(stored).not.toContain(code));

    // The codes handed to the user must still verify against what was stored.
    await expect(BackupCode.matches(returned[0], stored)).resolves.toBe(true);
  });
});

describe('AuthService.refreshToken', () => {
  it('rejects an access token replayed as a refresh token', async () => {
    const { service } = buildService(buildUser({ twoFactorEnabled: false }));
    const accessToken = jwt.sign({ userId: USER_ID, purpose: 'access' }, JWT_SECRET);

    await expect(service.refreshToken(accessToken)).rejects.toThrow('Invalid refresh token');
  });

  it('rejects a password-reset token replayed as a refresh token', async () => {
    const { service } = buildService(buildUser({ twoFactorEnabled: false }));
    const resetToken = jwt.sign({ sub: USER_ID, purpose: 'password_reset' }, JWT_SECRET);

    await expect(service.refreshToken(resetToken)).rejects.toThrow('Invalid refresh token');
  });

  it('accepts a genuine refresh token', async () => {
    const { service } = buildService(buildUser({ twoFactorEnabled: false }));
    const refreshToken = jwt.sign({ userId: USER_ID, purpose: 'refresh' }, JWT_SECRET);

    await expect(service.refreshToken(refreshToken)).resolves.toHaveProperty('token');
  });
});
