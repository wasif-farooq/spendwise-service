import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';
import { IUserRepository } from '../repositories/IUserRepository';
import { IAuthRepository } from '../repositories/IAuthRepository';
import { User } from '../models/User';
import { AuthIdentity } from '../models/AuthIdentity';
import { AppError } from '@shared/errors/AppError';
import { LoginDto, RegisterDto } from '../dto/auth.dto';
import { Password } from '@shared/types/Password';
import { Email } from '@shared/types/Email';
import jwt from 'jsonwebtoken';
import { ConfigLoader } from '@config/ConfigLoader';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

import { randomDigits, safeCompare } from '@shared/utils/secureRandom';
import { BackupCode } from '@shared/types/BackupCode';
import { issueTwoFactorTempToken, resolveTwoFactorTempToken } from './TwoFactorTempToken';
import {
  HANDOFF_INVALID_MESSAGE,
  HANDOFF_TTL_SECONDS,
  HandoffRecord,
  HandoffScope,
  generateHandoffCode,
  handoffKey,
  isHandoffScope,
  parseHandoffRecord,
} from './AuthHandoff';

import { DatabaseFacade } from '@facades/DatabaseFacade';
import { WorkspaceRepository } from '@domains/workspaces/repositories/WorkspaceRepository';
import { WorkspaceRoleRepository } from '@domains/workspaces/repositories/WorkspaceRoleRepository';
import { WorkspaceMembersRepository } from '@domains/workspaces/repositories/WorkspaceMembersRepository';
import { WorkspaceService } from '@domains/workspaces/services/WorkspaceService';
import { Workspace } from '@domains/workspaces/models/Workspace';
import { WorkspaceRole } from '@domains/workspaces/models/WorkspaceRole';
import { WorkspaceMember } from '@domains/workspaces/models/WorkspaceMember';
import { SubscriptionService } from '@domains/subscription/services/SubscriptionService';
import {
  AWAITED_SEND_TIMEOUT_MS,
  IEmailService,
  mayLogSecrets,
  sendEmailSafely,
} from '@domains/email/EmailService';
import {
  generatePasswordResetEmail,
  generateTwoFactorLoginEmail,
  generateTwoFactorSetupEmail,
  generateVerificationEmail,
} from '@domains/email/EmailTemplates';
import { verifyEmailLink } from '@domains/email/links';

/** Lifetimes of the emailed codes (cache TTLs), in seconds. */
const RESET_CODE_TTL_SECONDS = 900;
const TWO_FACTOR_LOGIN_CODE_TTL_SECONDS = 600;
const TWO_FACTOR_SETUP_TTL_SECONDS = 600;

/** The subset of a Google profile the login flow needs, from either source. */
interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}

type GoogleLoginResult = {
  token?: string;
  refreshToken?: string;
  user?: User;
  requiresTwoFactor?: boolean;
  availableMethods?: any[];
  tempToken?: string;
};

export class AuthService {
  /** Failed second-factor guesses allowed before the challenge is locked. */
  private static readonly MAX_2FA_ATTEMPTS = 5;

  constructor(
    @Inject(TOKENS.Database) private db: DatabaseFacade,
    @Inject('UserRepository') private userRepo: IUserRepository,
    @Inject('AuthRepository') private authRepo: IAuthRepository,
    @Inject(TOKENS.WorkspaceRepository) private workspaceRepository: WorkspaceRepository,
    @Inject(TOKENS.WorkspaceRoleRepository)
    private workspaceRoleRepository: WorkspaceRoleRepository,
    @Inject(TOKENS.WorkspaceMembersRepository)
    private workspaceMembersRepository: WorkspaceMembersRepository,
    @Inject(TOKENS.WorkspaceService) private workspaceService: WorkspaceService,
    @Inject(TOKENS.SubscriptionService) private subscriptionService: SubscriptionService,
    // Optional Cache Injection (Manual for now in Factory)
    private cache?: any,
    /** Defaults to the process-wide mailer (MAIL_PROVIDER); tests pass a fake. */
    private mailer?: IEmailService,
  ) {}

  async getUserById(userId: string): Promise<User> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  async register(dto: RegisterDto): Promise<{ user: User }> {
    const email = Email.create(dto.email);

    const existingUser = await this.userRepo.findByEmail(email.raw);
    if (existingUser) {
      throw new AppError('User already exists', 409);
    }

    const user = User.create({
      email: email.raw,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    const password = await Password.create(dto.password);

    // Generate verification code
    const verificationCode = randomDigits(6);
    user.setEmailVerificationCode(verificationCode);

    const identity = AuthIdentity.create({
      userId: user.id,
      provider: 'local',
      passwordHash: password.hash,
    });

    // Transactional registration: only save user and auth identity
    try {
      await this.db.transaction(async (trx) => {
        await this.userRepo.save(user, { db: trx });
        await this.authRepo.save(identity, { db: trx });
      });
    } catch (txError) {
      console.error('[AuthService] Registration transaction failed:', txError);
      throw txError;
    }

    // Awaited (with a short timeout) so a broken mail setup shows up in the
    // logs right away; a failed send never fails the registration.
    const message = generateVerificationEmail({
      firstName: user.firstName,
      code: verificationCode,
      verifyUrl: verifyEmailLink(user.email, verificationCode),
    });
    await sendEmailSafely(
      { to: user.email, ...message },
      {
        context: 'registration verification',
        timeoutMs: AWAITED_SEND_TIMEOUT_MS,
        mailer: this.mailer,
      },
    );

    return { user };
  }

  async verifyEmail(
    emailStr: string,
    code: string,
  ): Promise<{
    success: boolean;
    message: string;
    token?: string;
    refreshToken?: string;
    user?: any;
    warning?: string;
  }> {
    const email = Email.create(emailStr);
    const user = await this.userRepo.findByEmail(email.raw);
    if (!user) throw new AppError('User not found', 404);

    if (user.emailVerified) {
      throw new AppError('Email already verified', 400);
    }

    if (!safeCompare(user.emailVerificationCode, code)) {
      throw new AppError('Invalid verification code', 400);
    }

    user.verifyEmail();
    await this.userRepo.save(user);

    let resourceWarning: string | undefined;
    try {
      await this.subscriptionService.createFreeSubscription(user.id);
      await this.workspaceService.create(user.id, {
        name: 'My Account',
        slug: `my-account-${user.id.substring(0, 8)}`,
      });
    } catch (resourceError) {
      console.error('[AuthService] Post-verification resource creation failed:', resourceError);
      resourceWarning = 'Email verified, but workspace setup failed. Please contact support.';
    }

    const token = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    return {
      success: true,
      message: 'Email verified successfully',
      token,
      refreshToken,
      user: user.toJSON(),
      warning: resourceWarning,
    };
  }

  async login(dto: LoginDto): Promise<{
    token?: string;
    refreshToken?: string;
    user: User;
    requiresTwoFactor?: boolean;
    availableMethods?: any[];
    tempToken?: string;
  }> {
    const email = Email.create(dto.email);

    const user = await this.userRepo.findByEmail(email.raw);
    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    const identity = await this.authRepo.findByUserIdAndProvider(user.id, 'local');
    if (!identity || !identity.passwordHash) {
      throw new AppError('Invalid credentials', 401);
    }

    const password = Password.fromHash(identity.passwordHash);
    const valid = await password.compare(dto.password);

    if (!valid) {
      throw new AppError('Invalid credentials', 401);
    }

    // 2FA Check
    if (user.twoFactorEnabled) {
      return {
        user,
        requiresTwoFactor: true,
        availableMethods: user.twoFactorMethods.map((m) => ({
          type: m.type === 'app' ? 'authenticator' : m.type,
          enabled: true,
          verified: m.verified,
        })),
        tempToken: issueTwoFactorTempToken(user.id),
      };
    }

    // Generate Tokens
    const token = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    identity.updateLastLogin();
    await this.authRepo.save(identity);

    return { token, refreshToken, user };
  }

  /**
   * Web sign-in: exchange an authorization code (issued to the web client with
   * the fixed redirect URI) for tokens, then read the profile from userinfo.
   */
  async loginWithGoogle(code: string): Promise<GoogleLoginResult> {
    const config = ConfigLoader.getInstance();
    const googleConfig = config.get('auth.social.google') as any;

    if (!googleConfig?.clientId || !googleConfig?.clientSecret) {
      throw new AppError('Google OAuth not configured', 500);
    }

    // Step 1: Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: googleConfig.clientId,
        client_secret: googleConfig.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: googleConfig.redirectUri,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[AuthService] Google token exchange failed:', errorText);
      throw new AppError('Invalid Google authorization code', 400);
    }

    const tokens = (await tokenResponse.json()) as { access_token: string; id_token?: string };

    // Step 2: Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      throw new AppError('Failed to get user info from Google', 500);
    }

    const googleUser = (await userInfoResponse.json()) as {
      id?: string;
      email?: string;
      verified_email?: boolean;
      name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
    };

    // completeGoogleLogin links to an existing account by email, so the email must be one
    // Google has verified. Otherwise anyone could create a Google account on someone
    // else's (non-Gmail) address and sign in as them. The ID-token path checks
    // email_verified in verifyGoogleIdToken; this is the same check for userinfo.
    if (googleUser.verified_email !== true) {
      throw new AppError('Google account email is not verified', 401);
    }
    if (!googleUser.id || !googleUser.email) {
      throw new AppError('Failed to get user info from Google', 500);
    }

    return this.completeGoogleLogin({
      sub: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      given_name: googleUser.given_name,
      family_name: googleUser.family_name,
    });
  }

  /**
   * Native sign-in: the mobile app (expo-auth-session's Google provider) runs
   * the PKCE flow against its own iOS/Android client and sends us the
   * resulting ID token. There is no client secret on a device, so instead of
   * exchanging a code we verify the token with Google and check it was issued
   * to one of our client IDs.
   */
  async loginWithGoogleIdToken(idToken: string): Promise<GoogleLoginResult> {
    const allowedAudiences = this.getGoogleAudiences();
    if (allowedAudiences.length === 0) {
      throw new AppError('Google OAuth not configured', 500);
    }

    const profile = await this.verifyGoogleIdToken(idToken, allowedAudiences);
    return this.completeGoogleLogin(profile);
  }

  /** The web client ID plus every configured mobile client ID. */
  private getGoogleAudiences(): string[] {
    const googleConfig = ConfigLoader.getInstance().get('auth.social.google') as
      | { clientId?: unknown; mobileClientIds?: unknown }
      | undefined;
    const mobile = googleConfig?.mobileClientIds;
    const mobileIds = Array.isArray(mobile)
      ? mobile
      : typeof mobile === 'string'
        ? mobile.split(',')
        : [];

    return [googleConfig?.clientId, ...(mobileIds as unknown[])]
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  /**
   * Verify an ID token via Google's tokeninfo endpoint, which checks the
   * signature. We still have to check the claims: a validly signed token
   * minted for some other app's client ID must not log anyone in here.
   */
  private async verifyGoogleIdToken(
    idToken: string,
    allowedAudiences: string[],
  ): Promise<GoogleProfile> {
    const invalid = () => new AppError('Invalid Google ID token', 401);

    let response: Response;
    try {
      response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      );
    } catch (error) {
      console.error('[AuthService] Google tokeninfo request failed:', error);
      throw invalid();
    }

    if (!response.ok) {
      throw invalid();
    }

    const claims = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!claims) {
      throw invalid();
    }

    const { iss, aud, exp, sub, email, email_verified } = claims;

    if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') {
      throw invalid();
    }
    if (typeof aud !== 'string' || !allowedAudiences.includes(aud)) {
      throw invalid();
    }
    const expiresAt = Number(exp);
    if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) {
      throw invalid();
    }
    if (email_verified !== true && email_verified !== 'true') {
      throw invalid();
    }
    if (typeof sub !== 'string' || !sub || typeof email !== 'string' || !email) {
      throw invalid();
    }

    const optionalString = (value: unknown) => (typeof value === 'string' ? value : undefined);

    return {
      sub,
      email,
      name: optionalString(claims.name),
      given_name: optionalString(claims.given_name),
      family_name: optionalString(claims.family_name),
    };
  }

  /**
   * Shared tail of both Google flows: find or create the user, link the
   * Google identity, provision default resources, then either start the 2FA
   * challenge or issue tokens.
   */
  private async completeGoogleLogin(googleUser: GoogleProfile): Promise<GoogleLoginResult> {
    // Step 3: Find existing auth identity by provider + sub
    let user = await this.userRepo.findByEmail(googleUser.email);
    let isNewUser = false;

    if (user) {
      // Check if user has Google auth identity linked
      const authIdentity = await this.authRepo.findByUserIdAndProvider(user.id, 'google');
      if (!authIdentity) {
        // User exists but no Google identity - link it
        const newIdentity = AuthIdentity.create({
          userId: user.id,
          provider: 'google',
          sub: googleUser.sub,
        });
        await this.authRepo.save(newIdentity);
      }

      // Mark email as verified if not already (Google verified the email)
      if (!user.emailVerified) {
        user.verifyEmail();
        await this.userRepo.save(user);
      }

      // Create resources if they don't exist (for existing users who linked Google)
      try {
        const existingSub = await this.subscriptionService.getCurrentSubscription(user.id);
        if (!existingSub) {
          await this.subscriptionService.createFreeSubscription(user.id);
        }

        // Check if user has any workspaces (by checking workspace members)
        const memberCheck = await this.workspaceMembersRepository.findByUserId(user.id);
        if (memberCheck.length === 0) {
          await this.workspaceService.create(user.id, {
            name: 'My Account',
            slug: `my-account-${user.id.substring(0, 8)}`,
          });
        }
      } catch (resourceError) {
        console.error('[AuthService] Post-Google-login resource creation failed:', resourceError);
      }
    } else {
      // Step 4: Create new user
      isNewUser = true;
      user = User.create({
        email: googleUser.email,
        firstName: googleUser.given_name || googleUser.name?.split(' ')[0] || 'User',
        lastName: googleUser.family_name || googleUser.name?.split(' ').slice(1).join(' ') || '',
      });
      await this.userRepo.save(user);

      // Create auth identity with provider 'google'
      const identity = AuthIdentity.create({
        userId: user.id,
        provider: 'google',
        sub: googleUser.sub,
      });
      await this.authRepo.save(identity);

      // Mark email as verified (Google already verified)
      user.verifyEmail();
      await this.userRepo.save(user);

      // Create free subscription, workspace, and default categories
      try {
        await this.subscriptionService.createFreeSubscription(user.id);
        await this.workspaceService.create(user.id, {
          name: 'My Account',
          slug: `my-account-${user.id.substring(0, 8)}`,
        });
      } catch (resourceError) {
        console.error('[AuthService] Post-Google-login resource creation failed:', resourceError);
        // Don't throw - user can still login, just workspace might be missing
      }
    }

    if (!user) {
      throw new AppError('Failed to create or find user', 500);
    }

    // Step 5: Update last login
    const authIdentity = await this.authRepo.findByUserIdAndProvider(user.id, 'google');
    if (authIdentity) {
      authIdentity.updateLastLogin();
      await this.authRepo.save(authIdentity);
    }

    // Step 6: Check 2FA
    if (user.twoFactorEnabled) {
      return {
        user,
        requiresTwoFactor: true,
        availableMethods: user.twoFactorMethods.map((m) => ({
          type: m.type === 'app' ? 'authenticator' : m.type,
          enabled: true,
          verified: m.verified,
        })),
        tempToken: issueTwoFactorTempToken(user.id),
      };
    }

    // Step 7: Generate tokens
    const token = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    return {
      token,
      refreshToken,
      user,
    };
  }

  /**
   * Throttle second-factor guesses. A 6-digit code is only ~10^6 wide, which
   * is brute-forceable within a temp token's lifetime without a cap.
   */
  private async assertTwoFactorAttemptsRemaining(userId: string): Promise<void> {
    if (!this.cache) return;

    const attempts = Number((await this.cache.get(`2fa_attempts:${userId}`)) ?? 0);
    if (attempts >= AuthService.MAX_2FA_ATTEMPTS) {
      throw new AppError('Too many attempts. Please sign in again.', 429);
    }
  }

  private async recordFailedTwoFactorAttempt(userId: string): Promise<void> {
    if (!this.cache) return;

    const key = `2fa_attempts:${userId}`;
    const attempts = Number((await this.cache.get(key)) ?? 0) + 1;
    await this.cache.set(key, String(attempts), { EX: 900 });
  }

  private async clearTwoFactorAttempts(userId: string): Promise<void> {
    if (!this.cache) return;
    await this.cache.del(`2fa_attempts:${userId}`);
  }

  async verify2FA(
    tempToken: string,
    code: string,
    method?: string,
    isBackupCode = false,
  ): Promise<{ token: string; refreshToken: string; user: User }> {
    // The temp token is the only proof that the first factor was cleared.
    const userId = resolveTwoFactorTempToken(tempToken);

    if (isBackupCode) {
      return this.verifyBackupCode(tempToken, code);
    }

    await this.assertTwoFactorAttemptsRemaining(userId);

    const user = await this.userRepo.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    if (!user.twoFactorEnabled) {
      throw new AppError('2FA not enabled', 400);
    }

    let isValid = false;
    const selectedMethod = method || user.twoFactorMethod;

    if (selectedMethod === 'authenticator' || selectedMethod === 'app') {
      if (!user.twoFactorSecret) throw new AppError('TOTP not set up', 400);
      isValid = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: code,
      });
    } else {
      // SMS/Email codes live in the cache. If the cache is unreachable we
      // cannot verify anything, so fail closed rather than accepting a
      // well-known code.
      if (!this.cache) {
        throw new AppError('Two-factor verification is temporarily unavailable', 503);
      }

      const storedCode = await this.cache.get(`2fa_login:${user.id}:${selectedMethod}`);
      isValid = safeCompare(storedCode, code);
      if (isValid) {
        await this.cache.del(`2fa_login:${user.id}:${selectedMethod}`);
      }
    }

    if (!isValid) {
      await this.recordFailedTwoFactorAttempt(userId);
      throw new AppError('Invalid code', 400);
    }

    await this.clearTwoFactorAttempts(userId);

    const token = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);
    return { token, refreshToken, user };
  }

  async resend2FA(tempToken: string, method: string): Promise<void> {
    const userId = resolveTwoFactorTempToken(tempToken);
    const user = await this.userRepo.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    if (method === 'authenticator' || method === 'app') {
      // Nothing to "resend" for app method usually, user just opens app.
      // But we can check if it's set up.
      if (!user.twoFactorEnabled) throw new AppError('2FA not enabled', 400);
      return;
    }

    // For SMS/Email:
    // 1. Generate new code
    const code = randomDigits(6);

    // 2. Store in cache. Without it the code could never be verified, so
    //    surface the failure instead of sending a code that cannot work.
    if (!this.cache) {
      throw new AppError('Two-factor verification is temporarily unavailable', 503);
    }
    await this.cache.set(`2fa_login:${user.id}:${method}`, code, {
      EX: TWO_FACTOR_LOGIN_CODE_TTL_SECONDS,
    });

    // 3. Send via provider
    const methodInfo = user.twoFactorMethods.find((m) => m.type === method);

    if (method === 'email') {
      const message = generateTwoFactorLoginEmail({
        firstName: user.firstName,
        code,
        expiresInMinutes: TWO_FACTOR_LOGIN_CODE_TTL_SECONDS / 60,
      });
      // Fire-and-forget: the response never waits on SMTP.
      void sendEmailSafely(
        { to: methodInfo?.target || user.email, ...message },
        { context: '2FA sign-in code', mailer: this.mailer },
      );
      return;
    }

    // No SMS provider exists yet: the code can only be read from the dev log.
    console.log(
      `[2FA] No SMS provider configured; ${method} code for user ${user.id} not delivered` +
        (mayLogSecrets() ? ` (dev code: ${code})` : ''),
    );
  }

  async verifyBackupCode(
    tempToken: string,
    code: string,
  ): Promise<{ token: string; refreshToken: string; user: User }> {
    const userId = resolveTwoFactorTempToken(tempToken);

    await this.assertTwoFactorAttemptsRemaining(userId);

    const user = await this.userRepo.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    if (!user.twoFactorEnabled) {
      throw new AppError('2FA not enabled', 400);
    }

    const matches = await BackupCode.matches(code, user.backupCodes);
    if (!matches) {
      await this.recordFailedTwoFactorAttempt(userId);
      throw new AppError('Invalid backup code', 400);
    }

    await this.clearTwoFactorAttempts(userId);

    // Requirement: "if user use this method then disable his all 2fa methods"
    user.disable2FA();
    await this.userRepo.save(user);

    const token = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);
    return { token, refreshToken, user };
  }

  async refreshToken(token: string): Promise<{ token: string }> {
    const config = ConfigLoader.getInstance();
    const secret = config.get('auth.jwt.secret');

    try {
      const payload = jwt.verify(token, secret) as any;

      // Only tokens minted as refresh tokens may be exchanged here, otherwise
      // an access or password-reset token could be replayed for a fresh session.
      if (payload?.purpose !== 'refresh') {
        throw new AppError('Invalid refresh token', 401);
      }

      // In a real app, you might want to check a whitelist/database for the refresh token
      // or use a different secret for refresh tokens.

      const user = await this.userRepo.findById(payload.userId);
      if (!user) throw new AppError('User not found', 404);

      const newAccessToken = this.generateAccessToken(user);
      return { token: newAccessToken };
    } catch (err) {
      throw new AppError('Invalid refresh token', 401);
    }
  }

  /**
   * Issue a one-time code that a browser can exchange for a session of the
   * signed-in user. See AuthHandoff.ts for the security properties.
   */
  async issueHandoffCode(
    userId: string,
    scope: HandoffScope,
  ): Promise<{ code: string; expiresIn: number; scope: HandoffScope }> {
    if (!isHandoffScope(scope)) {
      throw new AppError('Unsupported handoff scope', 400);
    }
    // Codes live only in Redis; without it there is nothing to exchange later.
    if (!this.cache) {
      throw new AppError('Handoff is temporarily unavailable', 503);
    }

    const user = await this.userRepo.findById(userId);
    if (!user) throw new AppError('Unauthorized', 401);

    const code = generateHandoffCode();
    const record: HandoffRecord = { userId: user.id, scope, issuedAt: Date.now() };
    // NX: a 256-bit collision is not a practical concern, but never overwrite.
    const stored = await this.cache.set(handoffKey(code), JSON.stringify(record), {
      expiration: { type: 'EX', value: HANDOFF_TTL_SECONDS },
      condition: 'NX',
    });
    if (stored === null) {
      throw new AppError('Could not issue handoff code', 500);
    }

    return { code, expiresIn: HANDOFF_TTL_SECONDS, scope };
  }

  /**
   * Exchange a handoff code for a normal token pair (the login shape). The
   * code is read and deleted atomically, so it works at most once. Every
   * failure returns the same message.
   */
  async exchangeHandoffCode(
    code: string,
  ): Promise<{ token: string; refreshToken: string; user: User }> {
    if (!this.cache) {
      throw new AppError('Handoff is temporarily unavailable', 503);
    }
    if (typeof code !== 'string' || code.length === 0) {
      throw new AppError(HANDOFF_INVALID_MESSAGE, 401);
    }

    const raw = await this.cache.getDel(handoffKey(code));
    const record = parseHandoffRecord(raw);
    if (!record) {
      throw new AppError(HANDOFF_INVALID_MESSAGE, 401);
    }

    const user = await this.userRepo.findById(record.userId);
    if (!user) {
      throw new AppError(HANDOFF_INVALID_MESSAGE, 401);
    }

    const token = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);
    return { token, refreshToken, user };
  }

  private generateAccessToken(user: User): string {
    const config = ConfigLoader.getInstance();
    const secret = config.get('auth.jwt.secret');
    return jwt.sign({ userId: user.id, email: user.email, purpose: 'access' }, secret, {
      expiresIn: config.get('auth.jwt.accessTokenExpiry'),
    });
  }

  private generateRefreshToken(user: User): string {
    const config = ConfigLoader.getInstance();
    const secret = config.get('auth.jwt.secret');
    return jwt.sign({ userId: user.id, purpose: 'refresh' }, secret, {
      expiresIn: config.get('auth.jwt.refreshTokenExpiry'),
    });
  }

  async forgotPassword(emailStr: string): Promise<void> {
    const email = Email.create(emailStr);
    const user = await this.userRepo.findByEmail(email.raw);
    if (!user) {
      // Silently fail to prevent enumeration
      return;
    }

    // Generate Code
    const code = randomDigits(6);

    // Cache Code (TTL 15m). Without the cache the code could never be
    // verified, so don't email one.
    if (!this.cache) {
      console.error('[AuthService] Cache not configured: cannot store a password reset code');
      return;
    }
    await this.cache.set(`reset_code:${email.raw}`, code, { EX: RESET_CODE_TTL_SECONDS });

    // Awaited with a short timeout (see register); failures are logged only,
    // and the response stays the same whether or not the address exists.
    const message = generatePasswordResetEmail({
      firstName: user.firstName,
      code,
      expiresInMinutes: RESET_CODE_TTL_SECONDS / 60,
    });
    await sendEmailSafely(
      { to: user.email, ...message },
      { context: 'password reset', timeoutMs: AWAITED_SEND_TIMEOUT_MS, mailer: this.mailer },
    );
  }

  async verifyResetCode(emailStr: string, code: string): Promise<{ resetToken: string }> {
    const email = Email.create(emailStr);

    let validCode = false;
    if (this.cache) {
      const storedCode = await this.cache.get(`reset_code:${email.raw}`);
      if (safeCompare(storedCode, code)) {
        validCode = true;
        // Invalidate code used
        await this.cache.del(`reset_code:${email.raw}`);
      }
    }

    if (!validCode) {
      throw new AppError('Invalid or expired reset code', 400);
    }

    const user = await this.userRepo.findByEmail(email.raw);
    if (!user) throw new AppError('User not found', 404);

    // Generate Reset Token (Short lived, specific purpose)
    const config = ConfigLoader.getInstance();
    const secret = config.get('auth.jwt.secret');
    const resetToken = jwt.sign({ sub: user.id, purpose: 'password_reset' }, secret, {
      expiresIn: '15m',
    });

    return { resetToken };
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Verify Token
    const config = ConfigLoader.getInstance();
    const secret = config.get('auth.jwt.secret');

    let payload: any;
    try {
      payload = jwt.verify(token, secret);
    } catch (err) {
      throw new AppError('Invalid or expired reset token', 400);
    }

    if (payload.purpose !== 'password_reset') {
      throw new AppError('Invalid token purpose', 400);
    }

    const userId = payload.sub;
    const identity = await this.authRepo.findByUserIdAndProvider(userId, 'local');
    if (!identity) {
      throw new AppError('User identity not found', 404);
    }

    // Updates
    const password = await Password.create(newPassword);
    identity.changePassword(password.hash);

    await this.authRepo.save(identity);
  }

  async changePassword(userId: string, oldPass: string, newPass: string): Promise<void> {
    const identity = await this.authRepo.findByUserIdAndProvider(userId, 'local');
    if (!identity || !identity.passwordHash) {
      throw new AppError('User not found', 404);
    }

    const currentPassword = Password.fromHash(identity.passwordHash);
    const valid = await currentPassword.compare(oldPass);
    if (!valid) {
      throw new AppError('Incorrect current password', 400);
    }

    const newPassword = await Password.create(newPass);
    identity.changePassword(newPassword.hash);
    await this.authRepo.save(identity);
  }

  async generate2FASecret(
    userId: string,
    method: 'app' | 'sms' | 'email' = 'app',
    providedEmail?: string,
  ): Promise<{ secret?: string; backupCodes: string[]; qrCode?: string }> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    let secret: string;
    let qrCode: string | undefined;

    if (method === 'app') {
      const specSecret = speakeasy.generateSecret({
        name: `TrackMyPocket:${user.email}`,
        issuer: 'TrackMyPocket',
      });
      secret = specSecret.base32;
      qrCode = await QRCode.toDataURL(specSecret.otpauth_url || '');
    } else {
      // SMS or Email use a 6-digit code, delivered below once it is cached.
      secret = randomDigits(6);
    }

    // Only the hashes are persisted (and cached); the plaintext set is
    // returned to the user once, here, and never stored.
    const { plain: backupCodes, hashed: hashedBackupCodes } = await BackupCode.generateSet(8);

    // Cache the secret and backup codes temporarily for verification step
    if (this.cache) {
      const cacheKey = `2fa_pending:${userId}:${method}`;
      console.log(`[AuthService] Caching 2FA pending data for user ${userId}, method ${method}`);
      console.log(`[AuthService] Cache key: ${cacheKey}`);
      console.log(`[AuthService] Cache client readyState: ${this.cache.readyState}`);
      try {
        await this.cache.set(
          cacheKey,
          JSON.stringify({
            secret,
            backupCodes: hashedBackupCodes,
            method,
            target: method === 'email' ? providedEmail : undefined,
          }),
          { EX: TWO_FACTOR_SETUP_TTL_SECONDS },
        );
        console.log(`[AuthService] Successfully cached 2FA pending data`);
      } catch (cacheErr) {
        console.error(`[AuthService] Failed to cache 2FA pending data:`, cacheErr);
      }
    } else {
      console.log(`[AuthService] Cache is not available!`);
    }

    if (method === 'email') {
      const message = generateTwoFactorSetupEmail({
        firstName: user.firstName,
        code: secret,
        expiresInMinutes: TWO_FACTOR_SETUP_TTL_SECONDS / 60,
      });
      // Fire-and-forget: the setup response never waits on SMTP.
      void sendEmailSafely(
        { to: providedEmail || user.email, ...message },
        { context: '2FA setup code', mailer: this.mailer },
      );
    } else if (method === 'sms') {
      console.log(
        `[2FA Setup] No SMS provider configured; code for user ${userId} not delivered` +
          (mayLogSecrets() ? ` (dev code: ${secret})` : ''),
      );
    }

    return {
      secret: method === 'app' ? secret : undefined, // Security: Don't return code for email/sms
      backupCodes,
      qrCode,
    };
  }

  async enable2FA(
    userId: string,
    code: string,
    method: 'app' | 'sms' | 'email' = 'app',
  ): Promise<void> {
    let pending: any = null;
    const cacheKey = `2fa_pending:${userId}:${method}`;
    console.log(`[AuthService] enable2FA called for user ${userId}, method ${method}`);
    console.log(`[AuthService] Looking for cache key: ${cacheKey}`);
    console.log(`[AuthService] Cache client available: ${!!this.cache}`);
    if (this.cache) {
      console.log(`[AuthService] Cache client readyState: ${this.cache.readyState}`);
      try {
        const data = await this.cache.get(cacheKey);
        console.log(`[AuthService] Cache get result: ${data ? 'FOUND' : 'NOT FOUND'}`);
        if (data) pending = JSON.parse(data);
      } catch (cacheErr) {
        console.error(`[AuthService] Failed to get 2FA pending data from cache:`, cacheErr);
      }
    } else {
      console.log(`[AuthService] Cache is not available!`);
    }

    if (!pending) {
      throw new AppError('2FA setup session expired or not found', 400);
    }

    let isValid = false;
    if (method === 'app') {
      isValid = speakeasy.totp.verify({
        secret: pending.secret,
        encoding: 'base32',
        token: code,
      });
    } else {
      // SMS/Email check if code matches the temporary secret
      isValid = safeCompare(pending.secret, code);
    }

    if (!isValid) throw new AppError('Invalid code', 400);

    const user = await this.userRepo.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    // Enable 2FA
    user.enable2FA(method, pending.secret, pending.backupCodes, pending.target);
    await this.userRepo.save(user);

    // Clear cache
    if (this.cache) {
      await this.cache.del(`2fa_pending:${userId}:${method}`);
    }
  }

  async disable2FA(userId: string): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    user.disable2FA();
    await this.userRepo.save(user);
  }

  async disable2FAMethod(userId: string, method: 'app' | 'sms' | 'email'): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    user.disableMethod(method);
    await this.userRepo.save(user);
  }

  async regenerateBackupCodes(userId: string): Promise<string[]> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    if (!user.twoFactorEnabled) {
      throw new AppError('2FA is not enabled', 400);
    }

    const { plain, hashed } = await BackupCode.generateSet(8);

    user.updateBackupCodes(hashed);
    await this.userRepo.save(user);

    // Returned once so the user can record them; only hashes were stored.
    return plain;
  }

  async getActiveSessions(userId: string): Promise<any[]> {
    // Mock session data as session repository doesn't exist yet
    return [
      {
        id: 'current-session',
        device: 'Chrome on macOS',
        ip: '192.168.1.1',
        lastActive: new Date().toISOString(),
        isCurrent: true,
      },
      {
        id: 'other-session-1',
        device: 'Safari on iPhone',
        ip: '10.0.0.5',
        lastActive: new Date(Date.now() - 3600000).toISOString(),
        isCurrent: false,
      },
    ];
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    // Mock revoke session
    console.log(`[Mock] Revoking session ${sessionId} for user ${userId}`);
  }

  async getLoginHistory(userId: string): Promise<any[]> {
    // Mock login history
    return [
      {
        id: 'history-1',
        date: new Date().toISOString(),
        status: 'success',
        ip: '192.168.1.1',
        location: 'San Francisco, US',
        device: 'Chrome on macOS',
      },
      {
        id: 'history-2',
        date: new Date(Date.now() - 86400000).toISOString(),
        status: 'success',
        ip: '192.168.1.1',
        location: 'San Francisco, US',
        device: 'Chrome on macOS',
      },
      {
        id: 'history-3',
        date: new Date(Date.now() - 172800000).toISOString(),
        status: 'failed',
        ip: '45.12.3.4',
        location: 'Moscow, RU',
        device: 'Firefox on Linux',
      },
    ];
  }
}
