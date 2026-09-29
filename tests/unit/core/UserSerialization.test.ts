import { User, UserRole } from '@domains/auth/models/User';

const restored = () =>
  User.restore(
    {
      email: 'secret.holder@example.com',
      firstName: 'Sam',
      isActive: true,
      status: 'active',
      role: UserRole.PRO,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
      twoFactorEnabled: true,
      twoFactorMethod: 'app',
      twoFactorMethods: [{ type: 'app', verified: true }],
      twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      backupCodes: ['$2b$10$hashedcode1', '$2b$10$hashedcode2'],
      emailVerified: false,
      emailVerificationCode: '123456',
    },
    'user-1',
  );

describe('User.toJSON (the shape sent to clients)', () => {
  it('leaves out the TOTP secret, backup codes and email verification code', () => {
    const json = restored().toJSON();
    expect(json).not.toHaveProperty('twoFactorSecret');
    expect(json).not.toHaveProperty('backupCodes');
    expect(json).not.toHaveProperty('emailVerificationCode');

    const wire = JSON.stringify({ data: restored() });
    expect(wire).not.toContain('JBSWY3DPEHPK3PXP');
    expect(wire).not.toContain('hashedcode');
    expect(wire).not.toContain('123456');
  });

  it('keeps the profile and 2FA status fields the apps read', () => {
    expect(restored().toJSON()).toMatchObject({
      id: 'user-1',
      email: 'secret.holder@example.com',
      firstName: 'Sam',
      role: UserRole.PRO,
      twoFactorEnabled: true,
      twoFactorMethod: 'app',
      twoFactorMethods: [{ type: 'app', verified: true }],
      emailVerified: false,
    });
  });

  it('still exposes the secrets to server code through the getters', () => {
    const user = restored();
    expect(user.twoFactorSecret).toBe('JBSWY3DPEHPK3PXP');
    expect(user.backupCodes).toHaveLength(2);
    expect(user.emailVerificationCode).toBe('123456');
  });
});
