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


import { DatabaseFacade } from '@facades/DatabaseFacade';
import { OrganizationRepository } from '@domains/organizations/repositories/OrganizationRepository';
import { OrganizationRoleRepository } from '@domains/organizations/repositories/OrganizationRoleRepository';
import { OrganizationMembersRepository } from '@domains/organizations/repositories/OrganizationMembersRepository';
import { Organization } from '@domains/organizations/models/Organization';
import { OrganizationRole } from '@domains/organizations/models/OrganizationRole';
import { OrganizationMember } from '@domains/organizations/models/OrganizationMember';

export class AuthService {
    constructor(
        @Inject(TOKENS.Database) private db: DatabaseFacade,
        @Inject('UserRepository') private userRepo: IUserRepository,
        @Inject('AuthRepository') private authRepo: IAuthRepository,
        @Inject(TOKENS.OrganizationRepository) private organizationRepository: OrganizationRepository,
        @Inject(TOKENS.OrganizationRoleRepository) private organizationRoleRepository: OrganizationRoleRepository,
        @Inject(TOKENS.OrganizationMembersRepository) private organizationMembersRepository: OrganizationMembersRepository,
        // Optional Cache Injection (Manual for now in Factory)
        private cache?: any
    ) { }

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
            lastName: dto.lastName
        });

        const password = await Password.create(dto.password);

        // Generate verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        user.setEmailVerificationCode(verificationCode);

        const identity = AuthIdentity.create({
            userId: user.id,
            provider: 'local',
            passwordHash: password.hash
        });

        // Transactional registration
        await this.db.transaction(async (trx) => {
            // 1. Save User
            await this.userRepo.save(user, { db: trx });
            await this.authRepo.save(identity, { db: trx });

            // 2. Create Organization "My Account"
            const organization = Organization.create({
                name: "My Account",
                slug: `my-account-${user.id.substring(0, 8)}`, // Simple slug generation
                ownerId: user.id
            });
            const trxOrg = await this.organizationRepository.create(organization, { db: trx });

            // 3. Create Role "Admin"
            const adminRole = OrganizationRole.create({
                name: "Admin",
                organizationId: trxOrg.id,
                permissions: ['*'],
                isSystem: true
            });
            const trxRole = await this.organizationRoleRepository.create(adminRole, { db: trx });

            // 4. Assign Role to User
            const member = OrganizationMember.create({
                userId: user.id,
                organizationId: trxOrg.id,
                roleIds: [trxRole.id]
            });
            await this.organizationMembersRepository.create(member, { db: trx });
        });

        // Mock Send Registration Email
        console.log(`[Mock Email] Registration verification code for ${user.email}: ${verificationCode}`);

        return { user };
    }

    async verifyEmail(emailStr: string, code: string): Promise<{ success: boolean; message: string }> {
        const email = Email.create(emailStr);
        const user = await this.userRepo.findByEmail(email.raw);
        if (!user) throw new AppError('User not found', 404);

        if (user.emailVerified) {
            throw new AppError('Email already verified', 400);
        }

        if (user.emailVerificationCode !== code) {
            throw new AppError('Invalid verification code', 400);
        }

        user.verifyEmail();
        await this.userRepo.save(user);

        return {
            success: true,
            message: 'Email verified successfully'
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
                availableMethods: user.twoFactorMethods.map(m => ({
                    type: m.type === 'app' ? 'authenticator' : m.type,
                    enabled: true,
                    verified: m.verified
                })),
                tempToken: user.id
            };
        }

        // Generate Tokens
        const token = this.generateAccessToken(user);
        const refreshToken = this.generateRefreshToken(user);

        identity.updateLastLogin();
        await this.authRepo.save(identity);

        return { token, refreshToken, user };
    }

    async verify2FA(tempToken: string, code: string, method?: string): Promise<{ token: string; refreshToken: string; user: User }> {
        const user = await this.userRepo.findById(tempToken);
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
                token: code
            });
        } else {
            // SMS/Email
            if (this.cache) {
                const storedCode = await this.cache.get(`2fa_login:${user.id}:${selectedMethod}`);
                isValid = storedCode === code;
                if (isValid) {
                    await this.cache.del(`2fa_login:${user.id}:${selectedMethod}`);
                }
            } else {
                // Fallback for dev if cache missing (optional)
                isValid = code === '123456';
            }
        }

        if (!isValid) throw new AppError('Invalid code', 400);

        const token = this.generateAccessToken(user);
        const refreshToken = this.generateRefreshToken(user);
        return { token, refreshToken, user };
    }


    async resend2FA(tempToken: string, method: string): Promise<void> {
        const user = await this.userRepo.findById(tempToken);
        if (!user) throw new AppError('User not found', 404);

        if (method === 'authenticator' || method === 'app') {
            // Nothing to "resend" for app method usually, user just opens app.
            // But we can check if it's set up.
            if (!user.twoFactorEnabled) throw new AppError('2FA not enabled', 400);
            return;
        }

        // For SMS/Email:
        // 1. Generate new code
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // 2. Store in cache
        if (this.cache) {
            await this.cache.set(`2fa_login:${user.id}:${method}`, code, { EX: 600 });
        }

        // 3. Send via provider
        const methodInfo = user.twoFactorMethods.find(m => m.type === method);
        const target = methodInfo?.target || user.email;

        console.log(`\n[2FA] [Mock] Resending 2FA code to ${target} via ${method}: ${code}\n`);
    }


    async verifyBackupCode(tempToken: string, code: string): Promise<{ token: string; refreshToken: string; user: User }> {
        const user = await this.userRepo.findById(tempToken);
        if (!user) throw new AppError('User not found', 404);

        if (!user.backupCodes.includes(code)) {
            throw new AppError('Invalid backup code', 400);
        }

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

    private generateAccessToken(user: User): string {
        const config = ConfigLoader.getInstance();
        const secret = config.get('auth.jwt.secret');
        return jwt.sign(
            { userId: user.id, email: user.email },
            secret,
            { expiresIn: config.get('auth.jwt.accessTokenExpiry') }
        );
    }

    private generateRefreshToken(user: User): string {
        const config = ConfigLoader.getInstance();
        const secret = config.get('auth.jwt.secret');
        return jwt.sign(
            { userId: user.id, purpose: 'refresh' },
            secret,
            { expiresIn: config.get('auth.jwt.refreshTokenExpiry') }
        );
    }

    async forgotPassword(emailStr: string): Promise<void> {
        const email = Email.create(emailStr);
        const user = await this.userRepo.findByEmail(email.raw);
        if (!user) {
            // Silently fail to prevent enumeration
            return;
        }

        // Generate Code
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Cache Code (TTL 15m)
        if (this.cache) {
            await this.cache.set(`reset_code:${email.raw}`, code, { EX: 900 });
        } else {
            console.log("CACHE NOT CONFIGURED, CANNOT STORE RESET CODE");
        }

        // Mock Send Email
        console.log(`[Mock Email] Password reset code for ${email.raw}: ${code}`);
    }

    async verifyResetCode(emailStr: string, code: string): Promise<{ resetToken: string }> {
        const email = Email.create(emailStr);

        let validCode = false;
        if (this.cache) {
            const storedCode = await this.cache.get(`reset_code:${email.raw}`);
            if (storedCode === code) {
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
        const resetToken = jwt.sign(
            { sub: user.id, purpose: 'password_reset' },
            secret,
            { expiresIn: '15m' }
        );

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

    async generate2FASecret(userId: string, method: 'app' | 'sms' | 'email' = 'app', providedEmail?: string): Promise<{ secret?: string; backupCodes: string[]; qrCode?: string }> {
        const user = await this.userRepo.findById(userId);
        if (!user) throw new AppError('User not found', 404);

        let secret: string;
        let qrCode: string | undefined;

        if (method === 'app') {
            const specSecret = speakeasy.generateSecret({
                name: `SpendWise:${user.email}`,
                issuer: 'SpendWise'
            });
            secret = specSecret.base32;
            qrCode = await QRCode.toDataURL(specSecret.otpauth_url || '');
        } else {
            // SMS or Email use a 6-digit code
            secret = Math.floor(100000 + Math.random() * 900000).toString();

            if (method === 'email') {
                const targetEmail = providedEmail || user.email;
                console.log(`\n📧 [2FA Setup] [Mock Email] Sending 2FA setup code to ${targetEmail}: ${secret}\n`);
                try {
                    const mockPath = require('path').join(process.cwd(), 'mock_2fa_code.txt');
                    require('fs').writeFileSync(mockPath, `[2FA Setup] Email: ${targetEmail}, Code: ${secret}`);
                    console.log(`\n📄 [Mock] Code written to: ${mockPath}\n`);
                } catch (e) { }
            } else if (method === 'sms') {
                console.log(`\n📱 [2FA Setup] [Mock SMS] Sending 2FA setup code to user ${userId}: ${secret}\n`);
                try {
                    const mockPath = require('path').join(process.cwd(), 'mock_2fa_code.txt');
                    require('fs').writeFileSync(mockPath, `[2FA Setup] SMS: ${userId}, Code: ${secret}`);
                    console.log(`\n📄 [Mock] Code written to: ${mockPath}\n`);
                } catch (e) { }
            }
        }

        const backupCodes = Array.from({ length: 8 }, () =>
            Math.floor(10000000 + Math.random() * 90000000).toString()
        );

        // Cache the secret and backup codes temporarily for verification step
        if (this.cache) {
            await this.cache.set(`2fa_pending:${userId}:${method}`, JSON.stringify({
                secret,
                backupCodes,
                method,
                target: method === 'email' ? providedEmail : undefined
            }), { EX: 600 });
        }

        return {
            secret: method === 'app' ? secret : undefined, // Security: Don't return code for email/sms
            backupCodes,
            qrCode
        };
    }

    async enable2FA(userId: string, code: string, method: 'app' | 'sms' | 'email' = 'app'): Promise<void> {
        let pending: any = null;
        if (this.cache) {
            const data = await this.cache.get(`2fa_pending:${userId}:${method}`);
            if (data) pending = JSON.parse(data);
        }

        if (!pending) {
            throw new AppError('2FA setup session expired or not found', 400);
        }

        let isValid = false;
        if (method === 'app') {
            isValid = speakeasy.totp.verify({
                secret: pending.secret,
                encoding: 'base32',
                token: code
            });
        } else {
            // SMS/Email check if code matches the temporary secret
            isValid = pending.secret === code;
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

        const backupCodes = Array.from({ length: 8 }, () =>
            Math.floor(10000000 + Math.random() * 90000000).toString()
        );

        user.updateBackupCodes(backupCodes);
        await this.userRepo.save(user);

        return backupCodes;
    }

    async getActiveSessions(userId: string): Promise<any[]> {
        // Mock session data as session repository doesn't exist yet
        return [
            {
                id: 'current-session',
                device: 'Chrome on macOS',
                ip: '192.168.1.1',
                lastActive: new Date().toISOString(),
                isCurrent: true
            },
            {
                id: 'other-session-1',
                device: 'Safari on iPhone',
                ip: '10.0.0.5',
                lastActive: new Date(Date.now() - 3600000).toISOString(),
                isCurrent: false
            }
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
                device: 'Chrome on macOS'
            },
            {
                id: 'history-2',
                date: new Date(Date.now() - 86400000).toISOString(),
                status: 'success',
                ip: '192.168.1.1',
                location: 'San Francisco, US',
                device: 'Chrome on macOS'
            },
            {
                id: 'history-3',
                date: new Date(Date.now() - 172800000).toISOString(),
                status: 'failed',
                ip: '45.12.3.4',
                location: 'Moscow, RU',
                device: 'Firefox on Linux'
            }
        ];
    }
}
