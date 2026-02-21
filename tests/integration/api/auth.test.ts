import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import { Container } from '../../../src/core/di/Container';
import { TOKENS } from '../../../src/core/di/tokens';
import { AuthService } from '../../../src/modules/auth/services/AuthService';
import { AuthRequestRepository } from '../../../src/api/v1/modules/auth/repositories/AuthRequestRepository';
import { AuthControllerFactory } from '../../../src/core/application/factories/AuthControllerFactory';
import { RepositoryFactory } from '../../../src/core/application/factories/RepositoryFactory';
import { IUserRepository } from '../../../src/modules/auth/repositories/IUserRepository';

// Mock Repository to bypass Kafka and call AuthService directly
class MockAuthRequestRepository extends AuthRequestRepository {
    constructor(private authService: AuthService) {
        super(false);
    }

    async register(dto: any) {
        try {
            return await this.authService.register(dto);
        } catch (err: any) {
            return { error: err.message, statusCode: err.statusCode || 400 };
        }
    }

    async verifyEmail(dto: any) {
        try {
            await this.authService.verifyEmail(dto.userId, dto.code);
            return { success: true };
        } catch (err: any) {
            return { error: err.message, statusCode: err.statusCode || 400 };
        }
    }

    async login(dto: any) {
        try {
            return await this.authService.login(dto);
        } catch (err: any) {
            return { error: err.message, statusCode: err.statusCode || 400 };
        }
    }

    async verify2FA(dto: any) {
        try {
            return await this.authService.verify2FA(dto.userId, dto.code, dto.method);
        } catch (err: any) {
            return { error: err.message, statusCode: err.statusCode || 400 };
        }
    }

    async resend2FA(dto: any) {
        try {
            await this.authService.resend2FA(dto.userId, dto.method);
            return { success: true };
        } catch (err: any) {
            return { error: err.message, statusCode: err.statusCode || 400 };
        }
    }

    async verifyBackupCode(dto: any) {
        try {
            return await this.authService.verifyBackupCode(dto.userId, dto.code);
        } catch (err: any) {
            return { error: err.message, statusCode: err.statusCode || 400 };
        }
    }

    async forgotPassword(dto: any) {
        try {
            await this.authService.forgotPassword(dto.email);
            return { success: true };
        } catch (err: any) {
            return { error: err.message, statusCode: err.statusCode || 400 };
        }
    }

    async verifyResetCode(dto: any) {
        try {
            return await this.authService.verifyResetCode(dto.email, dto.code);
        } catch (err: any) {
            return { error: err.message, statusCode: err.statusCode || 400 };
        }
    }

    async resetPassword(dto: any) {
        try {
            await this.authService.resetPassword(dto.token, dto.newPassword);
            return { success: true };
        } catch (err: any) {
            return { error: err.message, statusCode: err.statusCode || 400 };
        }
    }

    async getMe(userId: string) {
        try {
            return await this.authService.getUserById(userId);
        } catch (err: any) {
            return { error: err.message, statusCode: err.statusCode || 404 };
        }
    }
}

describe('Auth Integration Flow', () => {
    let app: any;
    let authService: AuthService;
    let userRepo: IUserRepository;

    beforeAll(async () => {
        const container = Container.getInstance();
        authService = container.resolve<AuthService>(TOKENS.AuthService);
        userRepo = container.resolve<RepositoryFactory>(TOKENS.RepositoryFactory).createUserRepository();

        const mockRepo = new MockAuthRequestRepository(authService);

        // Mock the AuthControllerFactory to use our MockRepo
        const originalFactory = container.resolve<AuthControllerFactory>(TOKENS.AuthControllerFactory);
        const mockFactory = {
            create: () => originalFactory.create(mockRepo)
        };

        container.registerInstance(TOKENS.AuthControllerFactory, mockFactory);

        // Mock Cache for AuthService (needed for 2FA)
        const mockCache = {
            store: new Map<string, string>(),
            async set(key: string, value: string) { this.store.set(key, value); },
            async get(key: string) { return this.store.get(key); },
            async del(key: string) { this.store.delete(key); }
        };
        (authService as any).cache = mockCache;

        const { Server } = await import('../../../src/server/Server');
        const server = new Server();
        app = server.getApp();
    });

    it('should register a user, verify email, and login successfully', async () => {
        const email = `test-${Date.now()}@example.com`;

        // 1. Register
        const regRes = await request(app)
            .post('/api/v1/auth/register')
            .send({
                email,
                password: 'password123',
                firstName: 'Integration',
                lastName: 'Tester'
            });

        if (regRes.status !== 201) {
            console.error('Registration failed:', regRes.body);
        }
        expect(regRes.status).toBe(201);
        expect(regRes.body.user).toBeDefined();
        const userId = regRes.body.user.id;

        // 2. Get Verification Code from DB
        const user = await userRepo.findById(userId);
        expect(user).toBeDefined();
        const code = user!.emailVerificationCode;
        expect(code).toBeDefined();

        // 3. Verify Email
        const verifyRes = await request(app)
            .post('/api/v1/auth/verify-email')
            .send({ userId, code });

        expect(verifyRes.status).toBe(200);

        // 4. Login
        const loginRes = await request(app)
            .post('/api/v1/auth/login')
            .send({ email, password: 'password123' });

        expect(loginRes.status).toBe(200);
        expect(loginRes.body.token).toBeDefined();
        expect(loginRes.body.user.emailVerified).toBe(true);

        // 5. Get Me
        const token = loginRes.body.token;
        const meRes = await request(app)
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${token}`);

        expect(meRes.status).toBe(200);
        expect(meRes.body.email).toBe(email);
        expect(meRes.body.id).toBe(userId);
    });

    it('should setup and login with 2FA', async () => {
        const email = `test-2fa-${Date.now()}@example.com`;
        const password = 'password123';

        // 1. Register & Verify
        const regRes = await request(app)
            .post('/api/v1/auth/register')
            .send({ email, password, firstName: '2FA', lastName: 'Tester' });

        const userId = regRes.body.user.id;
        const userInDb = await userRepo.findById(userId);
        await request(app)
            .post('/api/v1/auth/verify-email')
            .send({ userId, code: userInDb!.emailVerificationCode });

        // 2. Login to get access token
        const loginRes = await request(app)
            .post('/api/v1/auth/login')
            .send({ email, password });
        const token = loginRes.body.token;

        // 3. Setup 2FA
        const setupRes = await request(app)
            .post('/api/v1/settings/2fa/setup')
            .set('Authorization', `Bearer ${token}`);

        expect(setupRes.status).toBe(200);
        const secret = setupRes.body.data.secret;

        // Enable 2FA with a valid TOTP code
        const speakeasy = require('speakeasy');
        const code = speakeasy.totp({
            secret: secret,
            encoding: 'base32'
        });

        const enableRes = await request(app)
            .post('/api/v1/settings/2fa/enable')
            .set('Authorization', `Bearer ${token}`)
            .send({ code });

        expect(enableRes.status).toBe(200);

        // 4. Login again (should require 2FA)
        const login2FARes = await request(app)
            .post('/api/v1/auth/login')
            .send({ email, password });

        expect(login2FARes.status).toBe(200);
        expect(login2FARes.body.requires2FA).toBe(true);

        // 5. Verify 2FA code
        const validCode = speakeasy.totp({
            secret: secret,
            encoding: 'base32'
        });

        const verify2FARes = await request(app)
            .post('/api/v1/auth/verify-2fa')
            .send({ userId, code: validCode, method: 'app' });

        expect(verify2FARes.status).toBe(200);
        expect(verify2FARes.body.token).toBeDefined();
    });
});
