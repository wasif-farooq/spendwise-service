import { AuthService } from '@domains/auth/services/AuthService';
import { issueTwoFactorTempToken } from '@domains/auth/services/TwoFactorTempToken';
import { User } from '@domains/auth/models/User';
import { WorkspaceService } from '@domains/workspaces/services/WorkspaceService';
import {
  SmtpEmailService,
  resolveSmtpSettings,
  setEmailServiceForTesting,
} from '@domains/email/EmailService';
import type { EmailOptions } from '@domains/email/types';

jest.mock('@config/ConfigLoader', () => ({
  ConfigLoader: {
    getInstance: () => ({
      get: (key: string) =>
        (
          ({
            'auth.jwt.secret': 'unit-test-secret',
            'auth.jwt.accessTokenExpiry': '15m',
            'auth.jwt.refreshTokenExpiry': '7d',
          }) as Record<string, string>
        )[key],
    }),
  },
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const flush = () => new Promise((resolve) => setImmediate(resolve));

const buildUser = (overrides: Partial<any> = {}): User =>
  User.restore(
    {
      email: 'user@example.com',
      firstName: 'Lee',
      isActive: true,
      status: 'active',
      role: 'free' as any,
      createdAt: new Date(),
      updatedAt: new Date(),
      twoFactorEnabled: true,
      twoFactorMethod: 'email',
      twoFactorMethods: [{ type: 'email', verified: true, target: 'second@example.com' }],
      backupCodes: [],
      ...overrides,
    } as any,
    USER_ID,
  );

/** A mailer that records what it was asked to send. */
const recordingMailer = () => {
  const sent: EmailOptions[] = [];
  const mailer = {
    send: jest.fn(async (options: EmailOptions) => {
      sent.push(options);
      return { success: true, messageId: 'm1' };
    }),
  };
  return { mailer, sent };
};

const buildAuth = (opts: { user?: User | null; cache?: any; mailer?: any } = {}) => {
  const userRepo = {
    findById: jest.fn().mockResolvedValue(opts.user ?? null),
    findByEmail: jest.fn().mockResolvedValue(opts.user ?? null),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const authRepo = { save: jest.fn().mockResolvedValue(undefined) };
  const db = { transaction: jest.fn(async (fn: any) => fn({})) };
  const cache =
    opts.cache === undefined ? { get: jest.fn(), set: jest.fn(), del: jest.fn() } : opts.cache;
  const service = new AuthService(
    db as any,
    userRepo as any,
    authRepo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    cache,
    opts.mailer,
  );
  return { service, userRepo, cache };
};

const codeIn = (text?: string) => text?.match(/^\s{4}(\d{6})$/m)?.[1];

let savedProvider: string | undefined;
let savedFrontend: string | undefined;
beforeEach(() => {
  savedProvider = process.env.MAIL_PROVIDER;
  savedFrontend = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = 'https://trackmypocket.com';
});
afterEach(() => {
  if (savedProvider === undefined) delete process.env.MAIL_PROVIDER;
  else process.env.MAIL_PROVIDER = savedProvider;
  if (savedFrontend === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = savedFrontend;
  setEmailServiceForTesting(null);
  jest.restoreAllMocks();
});

describe('registration', () => {
  it('emails the verification code with the check-email link', async () => {
    const { mailer, sent } = recordingMailer();
    const { service, userRepo } = buildAuth({ user: null, mailer });

    const result = await service.register({
      email: 'New@Example.com',
      firstName: 'Ana',
      lastName: 'Diaz',
      password: 'Str0ng!Passw0rd',
    } as any);

    const saved = userRepo.save.mock.calls[0][0] as User;
    const code = saved.emailVerificationCode as string;
    expect(Object.keys(result)).toEqual(['user']);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(saved.email);
    expect(sent[0].subject).toBe('Verify your TrackMyPocket email');
    expect(codeIn(sent[0].text)).toBe(code);
    expect(sent[0].text).toContain(
      `https://trackmypocket.com/check-email?email=${encodeURIComponent(saved.email)}&code=${code}`,
    );
    expect(sent[0].html).toContain('Hi Ana,');
  });

  it('still succeeds when the send throws', async () => {
    const mailer = { send: jest.fn().mockRejectedValue(new Error('ETIMEDOUT')) };
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service } = buildAuth({ user: null, mailer });
    await expect(
      service.register({
        email: 'x@example.com',
        firstName: 'X',
        lastName: 'Y',
        password: 'Str0ng!Passw0rd',
      } as any),
    ).resolves.toHaveProperty('user');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('ETIMEDOUT'));
  });
});

describe('forgot password', () => {
  it('stores the code for 15 minutes and emails the same code', async () => {
    const { mailer, sent } = recordingMailer();
    const { service, cache } = buildAuth({ user: buildUser(), mailer });

    await expect(service.forgotPassword('user@example.com')).resolves.toBeUndefined();

    const [key, code, opts] = cache.set.mock.calls[0];
    expect(key).toBe('reset_code:user@example.com');
    expect(opts).toEqual({ EX: 900 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: 'user@example.com',
      subject: 'Reset your TrackMyPocket password',
    });
    expect(codeIn(sent[0].text)).toBe(code);
    expect(sent[0].text).toContain('expires in 15 minutes');
  });

  it('sends nothing for an unknown address (same response)', async () => {
    const { mailer } = recordingMailer();
    const { service } = buildAuth({ user: null, mailer });
    await expect(service.forgotPassword('nobody@example.com')).resolves.toBeUndefined();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('still resolves when the send fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const mailer = { send: jest.fn().mockResolvedValue({ success: false, error: 'EAUTH' }) };
    const { service } = buildAuth({ user: buildUser(), mailer });
    await expect(service.forgotPassword('user@example.com')).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('EAUTH'));
  });
});

describe('two-factor by email', () => {
  it('resend-2fa emails the sign-in code to the method target', async () => {
    const { mailer, sent } = recordingMailer();
    const { service, cache } = buildAuth({ user: buildUser(), mailer });

    await expect(
      service.resend2FA(issueTwoFactorTempToken(USER_ID), 'email'),
    ).resolves.toBeUndefined();
    await flush();

    const [key, code, opts] = cache.set.mock.calls[0];
    expect(key).toBe(`2fa_login:${USER_ID}:email`);
    expect(opts).toEqual({ EX: 600 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: 'second@example.com',
      subject: 'Your TrackMyPocket sign-in code',
    });
    expect(codeIn(sent[0].text)).toBe(code);
  });

  it('resend-2fa does not wait for, or fail on, the send', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const mailer = { send: jest.fn(() => new Promise<never>(() => undefined)) };
    const { service } = buildAuth({ user: buildUser(), mailer });
    await expect(
      service.resend2FA(issueTwoFactorTempToken(USER_ID), 'email'),
    ).resolves.toBeUndefined();
    expect(mailer.send).toHaveBeenCalled();
  });

  it('2FA setup emails the confirmation code to the given address', async () => {
    const { mailer, sent } = recordingMailer();
    const { service, cache } = buildAuth({ user: buildUser({ twoFactorEnabled: false }), mailer });
    jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await service.generate2FASecret(USER_ID, 'email', 'me@example.org');
    await flush();

    expect(result.secret).toBeUndefined();
    const pending = JSON.parse(cache.set.mock.calls[0][1]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: 'me@example.org',
      subject: 'Confirm email two-factor authentication',
    });
    expect(codeIn(sent[0].text)).toBe(pending.secret);
  });

  it('authenticator setup sends no email', async () => {
    const { mailer } = recordingMailer();
    const { service } = buildAuth({ user: buildUser({ twoFactorEnabled: false }), mailer });
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await service.generate2FASecret(USER_ID, 'app');
    await flush();
    expect(mailer.send).not.toHaveBeenCalled();
  });
});

describe('with MAIL_PROVIDER=smtp no code reaches the logs', () => {
  it('across register, reset, 2FA sign-in, 2FA setup and SMS, even when SMTP fails', async () => {
    process.env.MAIL_PROVIDER = 'smtp';
    const codes: string[] = [];
    const sendMail = jest.fn(async (mail: { text?: string }) => {
      const code = codeIn(mail.text);
      if (code) codes.push(code);
      throw Object.assign(new Error('Invalid login: 535 Authentication failed'), { code: 'EAUTH' });
    });
    const smtp = new SmtpEmailService(
      resolveSmtpSettings({
        host: 'smtp.resend.com',
        port: 465,
        username: 'resend',
        password: 're_x',
      }),
      { sendMail } as any,
    );

    const logged: string[] = [];
    const capture = (...args: unknown[]) => {
      logged.push(
        args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(' '),
      );
    };
    (['log', 'info', 'warn', 'error', 'debug'] as const).forEach((level) =>
      jest.spyOn(console, level).mockImplementation(capture),
    );

    const newUser = buildAuth({ user: null, mailer: smtp });
    await newUser.service.register({
      email: 'n@example.com',
      firstName: 'N',
      lastName: 'U',
      password: 'Str0ng!Passw0rd',
    } as any);

    const existing = buildAuth({ user: buildUser(), mailer: smtp });
    await existing.service.forgotPassword('user@example.com');
    await existing.service.resend2FA(issueTwoFactorTempToken(USER_ID), 'email');
    await existing.service.resend2FA(issueTwoFactorTempToken(USER_ID), 'sms');
    await existing.service.generate2FASecret(USER_ID, 'email');
    await existing.service.generate2FASecret(USER_ID, 'sms');
    await flush();

    // SMS codes never go through the mailer: take them from the cache writes.
    existing.cache.set.mock.calls.forEach(([key, value]: [string, string]) => {
      if (key.startsWith('2fa_login:') && key.endsWith(':sms')) codes.push(value);
      if (key.startsWith('2fa_pending:') && key.endsWith(':sms'))
        codes.push(JSON.parse(value).secret);
    });

    expect(codes.length).toBe(6);
    expect(logged.join('\n')).toContain('EAUTH');
    for (const code of codes) {
      expect(logged.join('\n')).not.toContain(code);
    }
  });

  it('with the console provider the code is logged for local testing', async () => {
    delete process.env.MAIL_PROVIDER;
    const lines: string[] = [];
    jest.spyOn(console, 'log').mockImplementation((...args) => lines.push(args.join(' ')));
    const { service, cache } = buildAuth({ user: buildUser() }); // shared (console) mailer
    await service.forgotPassword('user@example.com');
    const code = cache.set.mock.calls[0][1];
    expect(lines.join('\n')).toContain(code);
  });
});

describe('workspace invitations', () => {
  const buildWorkspaceService = () => {
    const workspaceRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'w1', name: 'Family' }),
    };
    const userRepository = {
      findById: jest.fn().mockResolvedValue({ firstName: 'Sam', lastName: 'Lee', email: 's@x.co' }),
    };
    return new WorkspaceService(
      workspaceRepository as any,
      {} as any,
      {} as any,
      {} as any,
      userRepository as any,
      null as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  };
  const invitation = { email: 'guest@example.com', token: 'tok-123', invitedBy: 'u1' };

  it('emails the accept link through the mailer', async () => {
    const { mailer, sent } = recordingMailer();
    setEmailServiceForTesting(mailer);
    await (buildWorkspaceService() as any).sendInvitationEmail(invitation, 'w1');
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: 'guest@example.com',
      subject: 'Sam Lee invited you to Family on TrackMyPocket',
    });
    expect(sent[0].text).toContain('https://trackmypocket.com/invitations/accept?token=tok-123');
  });

  it('never throws when the send fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    setEmailServiceForTesting({ send: jest.fn().mockRejectedValue(new Error('down')) });
    await expect(
      (buildWorkspaceService() as any).sendInvitationEmail(invitation, 'w1'),
    ).resolves.toBeUndefined();
    await flush();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('down'));
  });
});
