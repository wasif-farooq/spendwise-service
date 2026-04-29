import nodemailer from 'nodemailer';
import { EmailOptions, EmailResult } from './types';
import { ConfigLoader } from '@config/ConfigLoader';

export interface IEmailService {
  send(options: EmailOptions): Promise<EmailResult>;
}

export class ConsoleEmailService implements IEmailService {
  async send(options: EmailOptions): Promise<EmailResult> {
    const emailData = {
      to: options.to,
      subject: options.subject,
      hasHtml: !!options.html,
      hasText: !!options.text,
      attachments: options.attachments?.map(a => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.content.length
      })) || []
    };

    console.log('='.repeat(60));
    console.log('[EMAIL] Sending Email');
    console.log('='.repeat(60));
    console.log(JSON.stringify(emailData, null, 2));
    console.log('-'.repeat(60));

    if (options.html) {
      console.log('[EMAIL HTML BODY]:');
      console.log(options.html);
    }

    if (options.attachments?.length) {
      console.log('-'.repeat(60));
      console.log(`[EMAIL] Attachments (${options.attachments.length}):`);
      options.attachments.forEach((att, i) => {
        console.log(`  ${i + 1}. ${att.filename} (${att.contentType}, ${att.content.length} bytes)`);
      });
    }

    console.log('='.repeat(60));

    return {
      success: true,
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }
}

export class SmtpEmailService implements IEmailService {
  private transporter: nodemailer.Transporter;
  private fromAddress: string;
  private fromName: string;

  constructor() {
    const config = ConfigLoader.getInstance();
    const mailConfig = config.get('mail') || {};

    this.fromAddress = mailConfig.fromAddress || 'noreply@spendwise.app';
    this.fromName = mailConfig.fromName || 'SpendWise';

    this.transporter = nodemailer.createTransport({
      host: mailConfig.host || 'smtp.mailtrap.io',
      port: parseInt(mailConfig.port) || 25,
      secure: mailConfig.secure === true || mailConfig.secure === 'true',
      auth: {
        user: mailConfig.username || '',
        pass: mailConfig.password || ''
      }
    });
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    try {
      const result = await this.transporter.sendMail({
        from: `${this.fromName} <${this.fromAddress}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType
        }))
      });

      return {
        success: true,
        messageId: result.messageId
      };
    } catch (error: any) {
      console.error('[EMAIL] Failed to send email:', error);
      return {
        success: false,
        messageId: undefined,
        error: error.message
      };
    }
  }
}

export class EmailServiceFactory {
  static create(provider?: string): IEmailService {
    // Use provided provider, or fall back to environment variable, or default to console
    const emailProvider = provider || process.env.MAIL_PROVIDER || 'console';
    
    if (emailProvider === 'smtp') {
      return new SmtpEmailService();
    }
    return new ConsoleEmailService();
  }
}