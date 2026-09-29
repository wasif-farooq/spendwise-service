/**
 * Links placed in emails. They point at the web app (FRONTEND_URL) using the
 * paths the web router serves. On phones with the app installed, /check-email
 * and /invitations/accept open the app instead (universal links / App Links:
 * UNIVERSAL_LINK_PATHS in the mobile app.config.ts, screens in linking.ts).
 */
export function frontendUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').trim().replace(/\/+$/, '');
}

export function appLink(path: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams(params).toString();
  return `${frontendUrl()}${path}${query ? `?${query}` : ''}`;
}

/** Web: CheckEmailPage (purpose "verify") fills the code in from ?email=&code=. */
export const verifyEmailLink = (email: string, code: string) =>
  appLink('/check-email', { email, code });

/** Web: AcceptInvitationPage; mobile: AcceptInvitation screen. */
export const invitationLink = (token: string) => appLink('/invitations/accept', { token });

/** Web: Settings > Plan & billing (/settings/subscription and /settings/billing redirect here). */
export const billingLink = () => appLink('/settings/plan');
