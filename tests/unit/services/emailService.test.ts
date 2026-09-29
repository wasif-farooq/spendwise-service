import {
  AWAITED_SEND_TIMEOUT_MS,
  ConsoleEmailService,
  EmailServiceFactory,
  SMTP_TIMEOUTS,
  SmtpEmailService,
  buildSmtpTransportOptions,
  describeMailProvider,
  getEmailService,
  logMailProvider,
  maskEmail,
  mayLogSecrets,
  resolveSmtpSettings,
  sendEmailSafely,
  setEmailServiceForTesting,
} from '@domains/email/EmailService';
import {
  generatePasswordResetEmail,
  generatePaymentFailureEmail,
  generateTwoFactorLoginEmail,
  generateTwoFactorSetupEmail,
  generateVerificationEmail,
  generateWorkspaceInvitationEmail,
} from '@domains/email/EmailTemplates';
import { billingLink, invitationLink, verifyEmailLink } from '@domains/email/links';

const RESEND_MAIL = {
  host: 'smtp.resend.com',
  port: 465,
  secure: true,
  username: 'resend',
  password: 're_supersecretkey',
  fromAddress: 'noreply@trackmypocket.com',
  fromName: 'TrackMyPocket',
};

let mailConfig: Record<string, any> = RESEND_MAIL;

jest.mock('@config/ConfigLoader', () => ({
  ConfigLoader: {
    getInstance: () => ({ get: (key: string) => (key === 'mail' ? mailConfig : undefined) }),
  },
}));

const ENV_KEYS = ['MAIL_PROVIDER', 'FRONTEND_URL'] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  ENV_KEYS.forEach((k) => (savedEnv[k] = process.env[k]));
  mailConfig = RESEND_MAIL;
  setEmailServiceForTesting(null);
});

afterEach(() => {
  ENV_KEYS.forEach((k) =>
    savedEnv[k] === undefined ? delete process.env[k] : (process.env[k] = savedEnv[k]),
  );
  setEmailServiceForTesting(null);
  jest.restoreAllMocks();
});

describe('provider selection', () => {
  it('uses the console provider by default', () => {
    delete process.env.MAIL_PROVIDER;
    expect(EmailServiceFactory.create()).toBeInstanceOf(ConsoleEmailService);
    expect(getEmailService()).toBeInstanceOf(ConsoleEmailService);
    expect(mayLogSecrets()).toBe(true);
  });

  it('uses SMTP when MAIL_PROVIDER=smtp (any case)', () => {
    process.env.MAIL_PROVIDER = 'SMTP';
    expect(EmailServiceFactory.create()).toBeInstanceOf(SmtpEmailService);
    expect(getEmailService()).toBeInstanceOf(SmtpEmailService);
    expect(mayLogSecrets()).toBe(false);
  });

  it('reuses one mailer per process', () => {
    process.env.MAIL_PROVIDER = 'smtp';
    expect(getEmailService()).toBe(getEmailService());
  });
});

describe('SMTP settings for Resend', () => {
  it('port 465 uses implicit TLS with the fixed timeouts', () => {
    const options = buildSmtpTransportOptions(resolveSmtpSettings(RESEND_MAIL));
    expect(options).toMatchObject({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      requireTLS: false,
      auth: { user: 'resend', pass: 're_supersecretkey' },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    expect(SMTP_TIMEOUTS).toEqual({
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  });

  it('port 465 is TLS even when MAIL_SMTP_SECURE is unset', () => {
    expect(resolveSmtpSettings({ ...RESEND_MAIL, secure: false }).secure).toBe(true);
  });

  it('port 587 requires STARTTLS', () => {
    const options = buildSmtpTransportOptions(
      resolveSmtpSettings({ ...RESEND_MAIL, port: '587', secure: 'false' }),
    );
    expect(options).toMatchObject({ port: 587, secure: false, requireTLS: true });
  });

  it('accepts "true" / "TLS" strings for secure', () => {
    expect(resolveSmtpSettings({ port: 2525, secure: 'true' }).secure).toBe(true);
    expect(resolveSmtpSettings({ port: 2525, secure: 'TLS' }).secure).toBe(true);
    expect(resolveSmtpSettings({ port: 2525 }).secure).toBe(false);
  });

  it('sends from "TrackMyPocket <noreply@trackmypocket.com>" with text and html', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'abc' });
    const service = new SmtpEmailService(resolveSmtpSettings(RESEND_MAIL), { sendMail } as any);
    const result = await service.send({ to: 'a@b.co', subject: 'S', text: 'T', html: '<p>H</p>' });
    expect(result).toEqual({ success: true, messageId: 'abc' });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: 'TrackMyPocket', address: 'noreply@trackmypocket.com' },
        to: 'a@b.co',
        text: 'T',
        html: '<p>H</p>',
      }),
    );
  });

  it('returns a failure with the reason, logging neither the body nor the full address', async () => {
    const error = Object.assign(new Error('Invalid login: 535 Authentication failed'), {
      code: 'EAUTH',
      responseCode: 535,
    });
    const log = { error: jest.fn() };
    const service = new SmtpEmailService(
      resolveSmtpSettings(RESEND_MAIL),
      { sendMail: jest.fn().mockRejectedValue(error) } as any,
      log,
    );
    const result = await service.send({
      to: 'jane@example.com',
      subject: 'Reset your TrackMyPocket password',
      text: 'code 482913',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('EAUTH 535');
    const logged = log.error.mock.calls.flat().join(' ');
    expect(logged).toContain('smtp.resend.com:465');
    expect(logged).toContain('j***@example.com');
    expect(logged).not.toContain('482913');
    expect(logged).not.toContain('jane@example.com');
  });
});

describe('startup log', () => {
  it('names the SMTP host but never the password', () => {
    process.env.MAIL_PROVIDER = 'smtp';
    const log = { log: jest.fn(), warn: jest.fn() };
    logMailProvider(log);
    const line = log.log.mock.calls[0][0];
    expect(line).toContain('smtp smtp.resend.com:465 (implicit TLS)');
    expect(line).toContain('user resend');
    expect(line).toContain('password set');
    expect(line).not.toContain('re_supersecretkey');
  });

  it('flags a missing password', () => {
    process.env.MAIL_PROVIDER = 'smtp';
    mailConfig = { ...RESEND_MAIL, password: '' };
    expect(describeMailProvider()).toContain('password MISSING');
  });

  it('says console and warns about unknown providers', () => {
    process.env.MAIL_PROVIDER = 'resend';
    const log = { log: jest.fn(), warn: jest.fn() };
    logMailProvider(log);
    expect(log.log.mock.calls[0][0]).toContain('console (emails are logged, not sent)');
    expect(log.warn).toHaveBeenCalled();
  });
});

describe('ConsoleEmailService', () => {
  it('logs the recipient, subject and text (including the code)', async () => {
    const log = { log: jest.fn() };
    const result = await new ConsoleEmailService(log).send({
      to: 'dev@example.com',
      subject: 'Verify your TrackMyPocket email',
      text: 'Your code:\n    123456',
      html: '<p>123456</p>',
    });
    expect(result.success).toBe(true);
    const out = log.log.mock.calls.flat().join('\n');
    expect(out).toContain('dev@example.com');
    expect(out).toContain('Verify your TrackMyPocket email');
    expect(out).toContain('123456');
  });
});

describe('sendEmailSafely', () => {
  const message = { to: 'jane@example.com', subject: 'S', text: 'code 777111' };

  it('never throws when the mailer throws, and logs the reason only', async () => {
    const log = { error: jest.fn(), warn: jest.fn() };
    const mailer = { send: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const result = await sendEmailSafely(message, { context: 'test', mailer, log });
    expect(result).toEqual({ success: false, error: 'ECONNREFUSED' });
    const logged = log.error.mock.calls.flat().join(' ');
    expect(logged).toContain('ECONNREFUSED');
    expect(logged).not.toContain('777111');
  });

  it('logs a returned failure', async () => {
    const log = { error: jest.fn(), warn: jest.fn() };
    const mailer = { send: jest.fn().mockResolvedValue({ success: false, error: 'smtp down' }) };
    await sendEmailSafely(message, { context: 'test', mailer, log });
    expect(log.error.mock.calls[0][0]).toContain('smtp down');
  });

  it('stops waiting after the timeout', async () => {
    const log = { error: jest.fn(), warn: jest.fn() };
    const mailer = { send: jest.fn(() => new Promise<never>(() => undefined)) };
    const result = await sendEmailSafely(message, {
      context: 'test',
      mailer,
      log,
      timeoutMs: 20,
    });
    expect(result).toEqual({ success: false, error: 'timed out after 20 ms' });
    expect(AWAITED_SEND_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });

  it('masks addresses', () => {
    expect(maskEmail('jane@example.com')).toBe('j***@example.com');
    expect(maskEmail('nope')).toBe('***');
  });
});

describe('links', () => {
  it('build on FRONTEND_URL with the web/mobile deep-link paths', () => {
    process.env.FRONTEND_URL = 'https://trackmypocket.com/';
    expect(verifyEmailLink('a+b@x.co', '123456')).toBe(
      'https://trackmypocket.com/check-email?email=a%2Bb%40x.co&code=123456',
    );
    expect(invitationLink('tok-1')).toBe(
      'https://trackmypocket.com/invitations/accept?token=tok-1',
    );
    expect(billingLink()).toBe('https://trackmypocket.com/settings/plan');
  });

  it('default to the local web app', () => {
    delete process.env.FRONTEND_URL;
    expect(billingLink()).toBe('http://localhost:5173/settings/plan');
  });
});

describe('templates', () => {
  const codeTemplates = [
    [
      'verification',
      generateVerificationEmail({ firstName: 'Lee', code: '123456', verifyUrl: 'https://t.co/v' }),
    ],
    [
      'password reset',
      generatePasswordResetEmail({ firstName: 'Lee', code: '123456', expiresInMinutes: 15 }),
    ],
    ['2FA sign-in', generateTwoFactorLoginEmail({ code: '123456', expiresInMinutes: 10 })],
    ['2FA setup', generateTwoFactorSetupEmail({ code: '123456', expiresInMinutes: 10 })],
  ] as const;

  it.each(codeTemplates)('%s: code in both parts, never in the subject', (_name, email) => {
    expect(email.text).toContain('123456');
    expect(email.html).toContain('123456');
    expect(email.subject).not.toContain('123456');
    expect(email.subject).toMatch(/TrackMyPocket|two-factor/);
    expect(email.text).toMatch(/Didn't|ignore/);
  });

  it.each(codeTemplates)('%s: no images or tracking pixels', (_name, email) => {
    expect(email.html).not.toMatch(/<img/i);
    expect(email.html).not.toMatch(/url\(/i);
  });

  it('states expiries', () => {
    expect(codeTemplates[1][1].text).toContain('expires in 15 minutes');
    expect(codeTemplates[2][1].text).toContain('expires in 10 minutes');
    expect(codeTemplates[0][1].text).toContain('valid until your email is verified');
  });

  it('verification carries the one-step link', () => {
    const email = codeTemplates[0][1];
    expect(email.text).toContain('https://t.co/v');
    expect(email.html).toContain('href="https://t.co/v"');
  });

  it('invitation escapes names and links to the accept page', () => {
    const email = generateWorkspaceInvitationEmail({
      workspaceName: '<b>Home</b>',
      inviterName: 'Sam',
      acceptUrl: 'https://trackmypocket.com/invitations/accept?token=t&x=1',
      expiresInDays: 7,
    });
    expect(email.subject).toBe('Sam invited you to <b>Home</b> on TrackMyPocket');
    expect(email.html).toContain('&lt;b&gt;Home&lt;/b&gt;');
    expect(email.html).not.toContain('<b>Home</b>');
    expect(email.html).toContain('invitations/accept?token=t&amp;x=1');
    expect(email.text).toContain('expires in 7 days');
  });

  it('payment failure has a text part and the billing link', () => {
    const email = generatePaymentFailureEmail({
      userName: 'Lee',
      userEmail: 'l@x.co',
      amount: 999,
      currency: 'usd',
      planName: 'Pro',
      billingUrl: 'https://trackmypocket.com/settings/plan',
    });
    expect(email.text).toContain('$9.99');
    expect(email.text).toContain('https://trackmypocket.com/settings/plan');
  });
});
