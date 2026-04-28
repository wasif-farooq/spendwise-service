import { EmailOptions, EmailResult } from './types';

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

export class EmailServiceFactory {
  static create(provider: 'console' = 'console'): IEmailService {
    switch (provider) {
      case 'console':
        return new ConsoleEmailService();
      default:
        return new ConsoleEmailService();
    }
  }
}