import {
  changePasswordSchema,
  passwordSchema,
  registerSchema,
  resetPasswordSchema,
} from '@domains/auth/validators/auth.validation';

const parse = (body: any) => changePasswordSchema.parse({ body });
const attempt = (body: any) => () => parse(body);

const VALID = { currentPassword: 'Old!Passw0rd', newPassword: 'New!Passw0rd' };

describe('changePasswordSchema', () => {
  it('accepts the payload the web client sends', () => {
    expect(parse(VALID).body).toEqual(VALID);
  });

  it('requires the current password', () => {
    expect(attempt({ newPassword: 'New!Passw0rd' })).toThrow();
    expect(attempt({ ...VALID, currentPassword: '' })).toThrow(/Current password is required/);
  });

  it('requires a new password', () => {
    expect(attempt({ currentPassword: 'Old!Passw0rd' })).toThrow();
  });

  it('rejects a new password that repeats the current one', () => {
    expect(attempt({ currentPassword: 'Same!Passw0rd', newPassword: 'Same!Passw0rd' })).toThrow(
      /must be different/,
    );
  });

  it('strips injected fields', () => {
    const parsed: any = parse({ ...VALID, userId: 'someone-else', role: 'SUPER_ADMIN' });

    expect(parsed.body.userId).toBeUndefined();
    expect(parsed.body.role).toBeUndefined();
  });

  it('rejects non-string input', () => {
    expect(attempt({ currentPassword: 123, newPassword: 'New!Passw0rd' })).toThrow();
    expect(attempt({ currentPassword: 'Old!Passw0rd', newPassword: null })).toThrow();
  });
});

const WEAK: [string, string][] = [
  ['too short', 'Ab1!c'],
  ['no uppercase', 'new!passw0rd'],
  ['no lowercase', 'NEW!PASSW0RD'],
  ['no number', 'New!Password'],
  ['no special character', 'NewPassw0rd'],
];

describe('resetPasswordSchema', () => {
  const reset = (body: any) => resetPasswordSchema.parse({ body });

  it('accepts a valid reset', () => {
    const parsed = reset({ token: 'reset.jwt.here', newPassword: 'New!Passw0rd' });

    expect(parsed.body.token).toBe('reset.jwt.here');
    expect(parsed.body.newPassword).toBe('New!Passw0rd');
  });

  it('requires a token', () => {
    expect(() => reset({ newPassword: 'New!Passw0rd' })).toThrow();
    expect(() => reset({ token: '', newPassword: 'New!Passw0rd' })).toThrow(
      /Reset token is required/,
    );
  });

  it.each(WEAK)('rejects a reset password with %s', (_label, password) => {
    // Previously only min(8) applied here, so a password rejected at
    // registration could be set by going through a password reset.
    expect(() => reset({ token: 'reset.jwt.here', newPassword: password })).toThrow();
  });
});

describe('the password policy is shared by every path that sets a password', () => {
  it.each(WEAK)('changePassword rejects %s', (_label, password) => {
    expect(attempt({ currentPassword: 'Old!Passw0rd', newPassword: password })).toThrow();
  });

  it('accepts a password meeting every rule', () => {
    expect(() => passwordSchema.parse('Str0ng!Password')).not.toThrow();
  });

  it('register, change and reset all reject the same weak passwords', () => {
    // The three Password.create call sites are register, resetPassword and
    // changePassword. All three route through passwordSchema, so the policy
    // cannot be bypassed by choosing a different endpoint.
    WEAK.forEach(([, password]) => {
      expect(() =>
        registerSchema.parse({
          body: { email: 'a@b.com', password, firstName: 'A', lastName: 'B' },
        }),
      ).toThrow();
      expect(() =>
        changePasswordSchema.parse({ body: { currentPassword: 'Old!Passw0rd', newPassword: password } }),
      ).toThrow();
      expect(() =>
        resetPasswordSchema.parse({ body: { token: 't', newPassword: password } }),
      ).toThrow();
    });
  });

  it('register, change and reset all accept the same strong password', () => {
    const strong = 'Str0ng!Password';

    expect(() =>
      registerSchema.parse({
        body: { email: 'a@b.com', password: strong, firstName: 'A', lastName: 'B' },
      }),
    ).not.toThrow();
    expect(() =>
      changePasswordSchema.parse({ body: { currentPassword: 'Old!Passw0rd', newPassword: strong } }),
    ).not.toThrow();
    expect(() =>
      resetPasswordSchema.parse({ body: { token: 't', newPassword: strong } }),
    ).not.toThrow();
  });
});
