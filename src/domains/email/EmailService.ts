import nodemailer from 'nodemailer';
import { EmailOptions, EmailResult } from './types';
import { ConfigLoader } from '@config/ConfigLoader';

export interface IEmailService {
  send(options: EmailOptions): Promise<EmailResult>;
}

/** MAIL_PROVIDER: 'smtp' sends for real; anything else (default 'console') only logs. */
export function mailProviderName(): 'smtp' | 'console' {
  return (process.env.MAIL_PROVIDER || 'console').trim().toLowerCase() === 'smtp'
    ? 'smtp'
    : 'console';
}

/**
 * Whether a one-time code may appear in logs. Only with the console provider,
 * where the log IS the delivery channel (local dev, and staging before mail is
 * configured). With SMTP the code goes to the inbox and nowhere else.
 */
export function mayLogSecrets(): boolean {
  return mailProviderName() !== 'smtp';
}

const newMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

/**
 * Development/staging stand-in: prints the whole message, including any code
 * in it, so sign-up, reset and 2FA can be completed from the logs.
 */
export class ConsoleEmailService implements IEmailService {
  constructor(private readonly log: Pick<Console, 'log'> = console) {}

  async send(options: EmailOptions): Promise<EmailResult> {
    const lines = [
      '='.repeat(60),
      '[EMAIL] (console provider: not sent, logged only)',
      `To:      ${options.to}`,
      `Subject: ${options.subject}`,
    ];
    if (options.attachments?.length) {
      lines.push(
        `Attachments: ${options.attachments
          .map((a) => `${a.filename} (${a.contentType}, ${a.content.length} bytes)`)
          .join(', ')}`,
      );
    }
    lines.push('-'.repeat(60));
    // The plain-text part carries everything the HTML does, and reads well in a log.
    if (options.text) {
      lines.push(options.text);
    } else if (options.html) {
      lines.push(options.html);
    }
    lines.push('='.repeat(60));
    this.log.log(lines.join('\n'));

    return { success: true, messageId: newMessageId() };
  }
}

export interface SmtpSettings {
  host: string;
  port: number;
  /** Implicit TLS (port 465). When false, STARTTLS is used if offered and required on 587. */
  secure: boolean;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
}

/** Nodemailer timeouts: fail fast on a wrong host/port instead of hanging a request. */
export const SMTP_TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
} as const;

const truthy = (value: unknown) =>
  value === true ||
  (typeof value === 'string' && ['true', 'tls', '1', 'yes'].includes(value.toLowerCase()));

/** Reads the `mail` config block (MAIL_* env vars). */
export function resolveSmtpSettings(mailConfig: Record<string, any> = {}): SmtpSettings {
  const port = parseInt(String(mailConfig.port ?? ''), 10) || 587;
  return {
    host: mailConfig.host || 'localhost',
    port,
    // Port 465 only speaks implicit TLS, so it is secure whatever MAIL_SMTP_SECURE says.
    secure: truthy(mailConfig.secure) || port === 465,
    username: mailConfig.username || '',
    password: mailConfig.password || '',
    fromAddress: mailConfig.fromAddress || 'noreply@trackmypocket.com',
    fromName: mailConfig.fromName || 'TrackMyPocket',
  };
}

export function buildSmtpTransportOptions(s: SmtpSettings) {
  return {
    host: s.host,
    port: s.port,
    secure: s.secure,
    // 587 is the submission port: refuse to send credentials without STARTTLS.
    requireTLS: !s.secure && s.port === 587,
    auth: s.username || s.password ? { user: s.username, pass: s.password } : undefined,
    ...SMTP_TIMEOUTS,
  };
}

/** "jane@example.com" -> "j***@example.com": enough to correlate, not a full address. */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${address[0]}***${address.slice(at)}`;
}

/** A failure reason safe to log: error code, SMTP reply code and message, never the body. */
export function describeSendError(error: unknown): string {
  const e = error as { code?: string; responseCode?: number; message?: string } | undefined;
  return (
    [e?.code, e?.responseCode, e?.message]
      .filter((part) => part !== undefined && part !== '')
      .join(' ') || String(error)
  );
}

export class SmtpEmailService implements IEmailService {
  private transporter: nodemailer.Transporter;
  readonly settings: SmtpSettings;

  constructor(
    settings?: SmtpSettings,
    transporter?: nodemailer.Transporter,
    private readonly log: Pick<Console, 'error'> = console,
  ) {
    this.settings = settings ?? resolveSmtpSettings(ConfigLoader.getInstance().get('mail') || {});
    this.transporter =
      transporter ?? nodemailer.createTransport(buildSmtpTransportOptions(this.settings));
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    try {
      const result = await this.transporter.sendMail({
        from: { name: this.settings.fromName, address: this.settings.fromAddress },
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      // Never the message itself: it may contain a one-time code.
      const reason = describeSendError(error);
      this.log.error(
        `[EMAIL] SMTP send failed (${this.settings.host}:${this.settings.port}) to=${maskEmail(options.to)} subject="${options.subject}": ${reason}`,
      );
      return { success: false, messageId: undefined, error: reason };
    }
  }
}

export class EmailServiceFactory {
  static create(provider?: string): IEmailService {
    const emailProvider = (provider || mailProviderName()).toLowerCase();
    if (emailProvider === 'smtp') {
      return new SmtpEmailService();
    }
    return new ConsoleEmailService();
  }
}

let sharedEmailService: IEmailService | null = null;

/** One mailer (and one SMTP connection setup) per process. */
export function getEmailService(): IEmailService {
  if (!sharedEmailService) {
    sharedEmailService = EmailServiceFactory.create();
  }
  return sharedEmailService;
}

/** Tests only: swap the shared mailer (null resets to the configured one). */
export function setEmailServiceForTesting(service: IEmailService | null): void {
  sharedEmailService = service;
}

/** Startup summary of the active mail setup. Never includes the password. */
export function describeMailProvider(): string {
  if (mailProviderName() !== 'smtp') {
    return 'console (emails are logged, not sent)';
  }
  const s = resolveSmtpSettings(ConfigLoader.getInstance().get('mail') || {});
  const tls = s.secure
    ? 'implicit TLS'
    : s.port === 587
      ? 'STARTTLS required'
      : 'STARTTLS if offered';
  return `smtp ${s.host}:${s.port} (${tls}), user ${s.username || '(none)'}, password ${
    s.password ? 'set' : 'MISSING'
  }, from "${s.fromName} <${s.fromAddress}>"`;
}

export function logMailProvider(log: Pick<Console, 'log' | 'warn'> = console): void {
  log.log(`[EMAIL] Mail provider: ${describeMailProvider()}`);
  const raw = (process.env.MAIL_PROVIDER || '').trim().toLowerCase();
  if (raw && raw !== 'smtp' && raw !== 'console') {
    log.warn(
      `[EMAIL] MAIL_PROVIDER="${raw}" is not supported (use smtp or console); using console`,
    );
  }
}

/** How long registration and password reset wait for the SMTP server. */
export const AWAITED_SEND_TIMEOUT_MS = 5_000;

export interface SafeSendOptions {
  /** Short label for logs, e.g. "registration verification". */
  context: string;
  /** Give up waiting after this long (the send itself may still complete). */
  timeoutMs?: number;
  mailer?: IEmailService;
  log?: Pick<Console, 'error' | 'warn'>;
}

/**
 * Sends without ever throwing: a mail failure is logged (with the reason, not
 * the message) and the caller's flow carries on unchanged.
 */
export async function sendEmailSafely(
  options: EmailOptions,
  { context, timeoutMs, mailer, log = console }: SafeSendOptions,
): Promise<EmailResult> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const send = (mailer ?? getEmailService()).send(options);
    const result = timeoutMs
      ? await Promise.race([
          send,
          new Promise<EmailResult>((resolve) => {
            timer = setTimeout(
              () => resolve({ success: false, error: `timed out after ${timeoutMs} ms` }),
              timeoutMs,
            );
            timer.unref?.();
          }),
        ])
      : await send;
    if (!result.success) {
      log.error(
        `[EMAIL] ${context} email to ${maskEmail(options.to)} not sent: ${result.error ?? 'unknown error'}`,
      );
    }
    return result;
  } catch (error) {
    const reason = describeSendError(error);
    log.error(`[EMAIL] ${context} email to ${maskEmail(options.to)} not sent: ${reason}`);
    return { success: false, error: reason };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
