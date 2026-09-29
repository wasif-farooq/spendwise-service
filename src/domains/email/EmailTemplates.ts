interface ExpenseReportData {
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalExpenses: number;
    transactionCount: number;
    averageTransaction: number;
    previousPeriodChange: number;
  };
  byCategory: Array<{ category: string; amount: number; percentage: number }>;
  byMerchant: Array<{ merchant: string; amount: number; count: number }>;
  topExpenses: Array<{ description: string; amount: number; date: string; category: string }>;
}

export function generateExpenseReportEmailHtml(data: ExpenseReportData): string {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Expense Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb;">
      <tr>
        <td align="center" style="padding: 40px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <!-- Header -->
            <tr>
              <td style="padding: 32px 40px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px 12px 0 0;">
                <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">Expense Report</h1>
                <p style="margin: 8px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px;">
                  ${formatDate(data.period.startDate)} - ${formatDate(data.period.endDate)}
                </p>
              </td>
            </tr>

            <!-- Summary -->
            <tr>
              <td style="padding: 32px 40px 24px;">
                <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 18px; font-weight: 600;">Summary</h2>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 16px; background-color: #f3f4f6; border-radius: 8px; text-align: center;">
                      <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Total Expenses</p>
                      <p style="margin: 8px 0 0 0; color: #111827; font-size: 28px; font-weight: 700;">${formatCurrency(data.summary.totalExpenses)}</p>
                    </td>
                    <td style="width: 16px;"></td>
                    <td style="padding: 16px; background-color: #f3f4f6; border-radius: 8px; text-align: center;">
                      <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Transactions</p>
                      <p style="margin: 8px 0 0 0; color: #111827; font-size: 28px; font-weight: 700;">${data.summary.transactionCount}</p>
                    </td>
                    <td style="width: 16px;"></td>
                    <td style="padding: 16px; background-color: #f3f4f6; border-radius: 8px; text-align: center;">
                      <p style="margin: 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Avg. Transaction</p>
                      <p style="margin: 8px 0 0 0; color: #111827; font-size: 28px; font-weight: 700;">${formatCurrency(data.summary.averageTransaction)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- By Category -->
            <tr>
              <td style="padding: 0 40px 24px;">
                <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 18px; font-weight: 600;">Expenses by Category</h2>
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${data.byCategory
                    .slice(0, 5)
                    .map(
                      (cat) => `
                    <tr>
                      <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                        <span style="color: #111827; font-size: 14px;">${escapeHtml(cat.category)}</span>
                      </td>
                      <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right;">
                        <span style="color: #111827; font-size: 14px; font-weight: 600;">${formatCurrency(cat.amount)}</span>
                        <span style="color: #6b7280; font-size: 12px; margin-left: 8px;">(${cat.percentage.toFixed(1)}%)</span>
                      </td>
                    </tr>
                  `,
                    )
                    .join('')}
                </table>
              </td>
            </tr>

            <!-- By Merchant -->
            <tr>
              <td style="padding: 0 40px 24px;">
                <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 18px; font-weight: 600;">Top Merchants</h2>
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${data.byMerchant
                    .slice(0, 5)
                    .map(
                      (merchant) => `
                    <tr>
                      <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                        <span style="color: #111827; font-size: 14px;">${escapeHtml(merchant.merchant)}</span>
                        <span style="color: #6b7280; font-size: 12px; margin-left: 8px;">(${merchant.count} transactions)</span>
                      </td>
                      <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right;">
                        <span style="color: #111827; font-size: 14px; font-weight: 600;">${formatCurrency(merchant.amount)}</span>
                      </td>
                    </tr>
                  `,
                    )
                    .join('')}
                </table>
              </td>
            </tr>

            <!-- Top Expenses -->
            <tr>
              <td style="padding: 0 40px 32px;">
                <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 18px; font-weight: 600;">Largest Transactions</h2>
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${data.topExpenses
                    .slice(0, 5)
                    .map(
                      (tx) => `
                    <tr>
                      <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                        <span style="color: #111827; font-size: 14px;">${escapeHtml(tx.description || 'No description')}</span>
                        <span style="color: #6b7280; font-size: 12px; margin-left: 8px;">${escapeHtml(tx.category)}</span>
                      </td>
                      <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; text-align: right;">
                        <span style="color: #ef4444; font-size: 14px; font-weight: 600;">${formatCurrency(tx.amount)}</span>
                      </td>
                    </tr>
                  `,
                    )
                    .join('')}
                </table>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 24px 40px; background-color: #f9fafb; border-radius: 0 0 12px 12px; text-align: center;">
                <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                  This report was generated by TrackMyPocket. 
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

export function getExpenseReportSubject(data: ExpenseReportData): string {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return `Expense Report - ${formatDate(data.period.startDate)} to ${formatDate(data.period.endDate)}`;
}

/** Plain-text part of the expense report email (the file is attached). */
export function generateExpenseReportEmailText(data: ExpenseReportData): string {
  const money = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  const lines = [
    `Your TrackMyPocket expense report for ${data.period.startDate} to ${data.period.endDate} is attached.`,
    '',
    `Total expenses: ${money(data.summary.totalExpenses)}`,
    `Transactions: ${data.summary.transactionCount}`,
    `Average transaction: ${money(data.summary.averageTransaction)}`,
  ];
  if (data.byCategory.length > 0) {
    lines.push('', 'Top categories:');
    data.byCategory
      .slice(0, 5)
      .forEach((c) =>
        lines.push(`  ${c.category}: ${money(c.amount)} (${c.percentage.toFixed(1)}%)`),
      );
  }
  lines.push(
    '',
    "You're receiving this because you asked for a report export in TrackMyPocket.",
    '',
    '— TrackMyPocket',
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Shared layout for transactional email.
//
// Every template returns { subject, text, html }. The text part carries the
// same content as the HTML. No images, remote assets or tracking pixels: the
// HTML is self-contained, and links are plain links to FRONTEND_URL.
// Subjects never contain a code, so a subject in a log line is safe.
// ---------------------------------------------------------------------------

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string,
  );

const BRAND = {
  name: 'TrackMyPocket',
  primary: '#059669',
  ink: '#111827',
  muted: '#4b5563',
  subtle: '#9ca3af',
  surface: '#f3f4f6',
  page: '#f9fafb',
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const greetingFor = (firstName?: string) => {
  const name = firstName?.trim();
  return name ? `Hi ${name},` : 'Hi,';
};

const minutesLabel = (minutes: number) => (minutes === 1 ? '1 minute' : `${minutes} minutes`);

const paragraph = (text: string) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(text)}</p>`;

const codeBlock = (code: string) =>
  `<div style="margin:8px 0 24px;padding:20px 12px;background:${BRAND.surface};border-radius:10px;text-align:center;">
      <span style="font-family:'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${BRAND.ink};">${escapeHtml(code)}</span>
    </div>`;

const button = (label: string, url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:8px;background:${BRAND.primary};">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
    </td></tr></table>`;

const notice = (text: string) =>
  `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.6;color:${BRAND.subtle};">${escapeHtml(text)}</p>`;

/** Wraps body blocks in the branded shell. `preheader` is the inbox preview line. */
function layout(title: string, preheader: string, blocks: string[]): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};font-family:${FONT};color:${BRAND.ink};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 4px 16px;font-size:18px;font-weight:700;color:${BRAND.primary};">${BRAND.name}</td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:12px;padding:32px;">
              <h1 style="margin:0 0 20px;font-size:21px;line-height:1.3;color:${BRAND.ink};">${escapeHtml(title)}</h1>
              ${blocks.join('\n              ')}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 4px;font-size:12px;line-height:1.6;color:${BRAND.subtle};">
              This is an automated message from ${BRAND.name}. Please don't reply to it.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const textEmail = (lines: string[]) =>
  [
    ...lines,
    '',
    `— ${BRAND.name}`,
    `This is an automated message from ${BRAND.name}. Please don't reply to it.`,
  ].join('\n');

// --- Registration: verify your email --------------------------------------

export interface VerificationEmailData {
  firstName?: string;
  code: string;
  /** Web link that fills the code in: FRONTEND_URL/check-email?email=…&code=… */
  verifyUrl: string;
}

export function generateVerificationEmail(data: VerificationEmailData): RenderedEmail {
  const subject = 'Verify your TrackMyPocket email';
  const intro = 'Welcome to TrackMyPocket. Enter this code to verify your email address:';
  const validity = 'The code stays valid until your email is verified.';
  const linkLine = 'Or open this link to verify in one step:';
  const ignore =
    "Didn't create a TrackMyPocket account? You can ignore this email; no account is activated without the code.";

  const text = textEmail([
    greetingFor(data.firstName),
    '',
    intro,
    '',
    `    ${data.code}`,
    '',
    validity,
    '',
    linkLine,
    data.verifyUrl,
    '',
    ignore,
  ]);
  const html = layout('Verify your email', `Your verification code is inside.`, [
    paragraph(greetingFor(data.firstName)),
    paragraph(intro),
    codeBlock(data.code),
    paragraph(validity),
    button('Verify email', data.verifyUrl),
    notice(ignore),
  ]);
  return { subject, text, html };
}

// --- Forgot password: reset code ------------------------------------------

export interface PasswordResetEmailData {
  firstName?: string;
  code: string;
  expiresInMinutes: number;
}

export function generatePasswordResetEmail(data: PasswordResetEmailData): RenderedEmail {
  const subject = 'Reset your TrackMyPocket password';
  const intro =
    'We received a request to reset your password. Enter this code in the app to choose a new one:';
  const validity = `The code expires in ${minutesLabel(data.expiresInMinutes)} and works once.`;
  const ignore =
    "Didn't request this? You can ignore this email; your password stays the same. If you keep getting these, consider changing your password.";

  const text = textEmail([
    greetingFor(data.firstName),
    '',
    intro,
    '',
    `    ${data.code}`,
    '',
    validity,
    '',
    ignore,
  ]);
  const html = layout('Reset your password', `Your password reset code is inside.`, [
    paragraph(greetingFor(data.firstName)),
    paragraph(intro),
    codeBlock(data.code),
    paragraph(validity),
    notice(ignore),
  ]);
  return { subject, text, html };
}

// --- Two-factor: sign-in code ----------------------------------------------

export interface TwoFactorLoginEmailData {
  firstName?: string;
  code: string;
  expiresInMinutes: number;
}

export function generateTwoFactorLoginEmail(data: TwoFactorLoginEmailData): RenderedEmail {
  const subject = 'Your TrackMyPocket sign-in code';
  const intro = 'Use this code to finish signing in to TrackMyPocket:';
  const validity = `The code expires in ${minutesLabel(data.expiresInMinutes)}.`;
  const ignore =
    "Didn't try to sign in? Someone may know your password. Don't share this code, and change your password now.";

  const text = textEmail([
    greetingFor(data.firstName),
    '',
    intro,
    '',
    `    ${data.code}`,
    '',
    validity,
    '',
    ignore,
  ]);
  const html = layout('Your sign-in code', `Your sign-in code is inside.`, [
    paragraph(greetingFor(data.firstName)),
    paragraph(intro),
    codeBlock(data.code),
    paragraph(validity),
    notice(ignore),
  ]);
  return { subject, text, html };
}

// --- Two-factor: setting up the email method -------------------------------

export interface TwoFactorSetupEmailData {
  firstName?: string;
  code: string;
  expiresInMinutes: number;
}

export function generateTwoFactorSetupEmail(data: TwoFactorSetupEmailData): RenderedEmail {
  const subject = 'Confirm email two-factor authentication';
  const intro =
    'You are turning on two-factor authentication by email for your TrackMyPocket account. Enter this code to confirm this address:';
  const validity = `The code expires in ${minutesLabel(data.expiresInMinutes)}.`;
  const ignore =
    "Didn't request this? Nothing changes unless the code is entered. If you didn't start this, change your TrackMyPocket password.";

  const text = textEmail([
    greetingFor(data.firstName),
    '',
    intro,
    '',
    `    ${data.code}`,
    '',
    validity,
    '',
    ignore,
  ]);
  const html = layout('Confirm two-factor authentication', `Your confirmation code is inside.`, [
    paragraph(greetingFor(data.firstName)),
    paragraph(intro),
    codeBlock(data.code),
    paragraph(validity),
    notice(ignore),
  ]);
  return { subject, text, html };
}

// --- Workspace invitation ---------------------------------------------------

export interface WorkspaceInvitationEmailData {
  workspaceName: string;
  inviterName?: string;
  /** FRONTEND_URL/invitations/accept?token=… (a universal link on mobile). */
  acceptUrl: string;
  expiresInDays: number;
}

export function generateWorkspaceInvitationEmail(
  data: WorkspaceInvitationEmailData,
): RenderedEmail {
  const who = data.inviterName?.trim() || 'Someone';
  const subject = `${who} invited you to ${data.workspaceName} on TrackMyPocket`;
  const intro = `${who} invited you to join the "${data.workspaceName}" workspace on TrackMyPocket.`;
  const validity = `The invitation expires in ${data.expiresInDays} days.`;
  const ignore =
    "Not expecting this? You can ignore this email; you won't be added to anything unless you accept.";

  const text = textEmail([
    'Hi,',
    '',
    intro,
    '',
    'Accept the invitation:',
    data.acceptUrl,
    '',
    validity,
    '',
    ignore,
  ]);
  const html = layout('You are invited', `Join ${data.workspaceName} on TrackMyPocket.`, [
    paragraph('Hi,'),
    paragraph(intro),
    button('Accept invitation', data.acceptUrl),
    paragraph(validity),
    notice(ignore),
  ]);
  return { subject, text, html };
}

// --- Payment failed ---------------------------------------------------------

interface PaymentFailureData {
  userName: string;
  userEmail: string;
  /** Minor units (cents). */
  amount: number;
  currency: string;
  planName: string;
  nextBillingDate?: string;
  billingUrl: string;
}

export function generatePaymentFailureEmail(data: PaymentFailureData): RenderedEmail {
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (data.currency || 'USD').toUpperCase(),
  }).format(data.amount / 100);

  const subject = 'Action required: your TrackMyPocket payment failed';
  const intro = `We couldn't charge ${amount} for your ${data.planName} subscription. Your access continues while the payment is retried over the next few days.`;
  const action = 'Update your payment method to fix this now:';
  const ignore = "If you think this is a mistake, contact support and we'll look into it.";

  const text = textEmail([
    greetingFor(data.userName),
    '',
    intro,
    '',
    action,
    data.billingUrl,
    '',
    ignore,
  ]);
  const html = layout('Your payment failed', 'Update your payment method to keep your plan.', [
    paragraph(greetingFor(data.userName)),
    paragraph(intro),
    paragraph(action),
    button('Update payment method', data.billingUrl),
    notice(ignore),
  ]);
  return { subject, text, html };
}

export function generatePaymentFailureEmailHtml(data: PaymentFailureData): string {
  return generatePaymentFailureEmail(data).html;
}

export function getPaymentFailureSubject(): string {
  return 'Action required: your TrackMyPocket payment failed';
}

// --- Account deleted --------------------------------------------------------

interface AccountDeletedData {
  firstName?: string;
  /** Workspaces deleted with the account (names only). */
  deletedWorkspaces: string[];
  /** Workspaces the user was removed from. */
  leftWorkspaces: string[];
  subscriptionCancelled: boolean;
}

/** Confirmation sent after DELETE /auth/account. Plain text first; the HTML mirrors it. */
export function generateAccountDeletedEmail(data: AccountDeletedData): RenderedEmail {
  const greeting = greetingFor(data.firstName);
  const lines: string[] = ['Your TrackMyPocket account and your personal data have been deleted.'];
  if (data.deletedWorkspaces.length > 0) {
    lines.push(
      `Deleted with it, including their accounts, transactions, budgets and receipts: ${data.deletedWorkspaces.join(', ')}.`,
    );
  }
  if (data.leftWorkspaces.length > 0) {
    lines.push(`You were removed from: ${data.leftWorkspaces.join(', ')}.`);
  }
  if (data.subscriptionCancelled) {
    lines.push('Your paid subscription was cancelled and will not renew.');
  }
  lines.push(
    'Payment records are kept, without your name or email, for as long as tax law requires.',
  );
  const ignore = "If you didn't ask for this, contact support right away.";

  const text = [greeting, '', ...lines, '', ignore, '', '— TrackMyPocket'].join('\n');
  const html = layout('Your account was deleted', 'Your TrackMyPocket account was deleted.', [
    paragraph(greeting),
    ...lines.map(paragraph),
    notice(ignore),
  ]);

  return { subject: 'Your TrackMyPocket account was deleted', text, html };
}
