import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { Container } from '../../../src/core/di/Container';
import { TOKENS } from '../../../src/core/di/tokens';
import { AuthService } from '../../../src/modules/auth/services/AuthService';
import { RepositoryFactory } from '../../../src/core/application/factories/RepositoryFactory';

describe('Settings Integration Flow', () => {
    let app: any;
    let authService: AuthService;
    let token: string;
    let userId: string;

    beforeAll(async () => {
        const container = Container.getInstance();
        authService = container.resolve<AuthService>(TOKENS.AuthService);

        const { Server } = await import('../../../src/server/Server');
        const server = new Server();
        app = server.getApp();

        // Setup User and Token
        const email = `settings-test-${Date.now()}@example.com`;
        const password = 'password123';
        const regRes = await authService.register({ email, password, firstName: 'Settings', lastName: 'Tester' });
        userId = regRes.user.id;

        // Auto-verify email
        const userRepo = container.resolve<RepositoryFactory>(TOKENS.RepositoryFactory).createUserRepository();
        const user = await userRepo.findById(userId);
        if (user) {
            user.verifyEmail();
            await userRepo.save(user);
        }

        const loginRes = await authService.login({ email, password });
        token = loginRes.token!;
    });

    it('should get default preferences', async () => {
        const res = await request(app)
            .get('/api/v1/settings/preferences')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toBeDefined();
        expect(res.body.data.theme).toBe('system');
        expect(res.body.data.language).toBe('en');
    });

    it('should update preferences', async () => {
        const updates = {
            theme: 'dark',
            language: 'fr',
            timezone: 'Europe/Paris'
        };

        const res = await request(app)
            .put('/api/v1/settings/preferences')
            .set('Authorization', `Bearer ${token}`)
            .send(updates);

        expect(res.status).toBe(200);
        expect(res.body.data.theme).toBe('dark');
        expect(res.body.data.language).toBe('fr');
        expect(res.body.data.timezone).toBe('Europe/Paris');

        // Verify with another GET
        const verifyRes = await request(app)
            .get('/api/v1/settings/preferences')
            .set('Authorization', `Bearer ${token}`);
        expect(verifyRes.body.data.language).toBe('fr');
    });

    it('should get security settings', async () => {
        const res = await request(app)
            .get('/api/v1/settings/security')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.twoFactorEnabled).toBe(false);
    });
});
