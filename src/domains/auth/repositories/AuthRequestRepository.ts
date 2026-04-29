import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { PostgresFactory } from '@database/factories/PostgresFactory';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { ServiceFactory } from '@factories/ServiceFactory';
import { AuthService } from '@domains/auth/services/AuthService';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

export class AuthRequestRepository {
    private config = ConfigLoader.getInstance();
    private cachedService: AuthService | null = null;
    private servicePromise: Promise<AuthService> | null = null;

    private getMode(): string {
        return this.config.get('repository.mode') || 'direct';
    }

    // Get the service using ServiceFactory (cached)
    private async getService(): Promise<AuthService> {
        if (this.cachedService) {
            return this.cachedService;
        }

        if (this.servicePromise) {
            return this.servicePromise;
        }

        console.log('[AuthRequestRepository] Creating new ServiceFactory instance');
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const repoFactory = new RepositoryFactory(db);
        const serviceFactory = new ServiceFactory(repoFactory, db);

        this.servicePromise = serviceFactory.createAuthService().then(authService => {
            console.log('[AuthRequestRepository] AuthService created successfully');
            this.cachedService = authService;
            this.servicePromise = null;
            return authService;
        });

        return this.servicePromise;
    }

    // Helper to wrap responses in RPC-style format
    private wrap(promise: Promise<any>): Promise<any> {
        return promise
            .then(data => ({ data, error: null, statusCode: 200 }))
            .catch(error => ({ 
                error: error.message || 'An error occurred', 
                statusCode: error.statusCode || 500,
                data: null 
            }));
    }

    async login(dto: any) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.login(dto));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async register(dto: any) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.register(dto));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async verify2FA(dto: any) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.verify2FA(dto.tempToken || dto.temp_token, dto.code, dto.method));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async resend2FA(dto: any) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.resend2FA(dto.tempToken || dto.temp_token, dto.method));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async verifyBackupCode(dto: any) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.verifyBackupCode(dto.tempToken || dto.temp_token, dto.code));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async forgotPassword(dto: any) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.forgotPassword(dto.email));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async verifyResetCode(dto: any) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.verifyResetCode(dto.email, dto.code));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async resetPassword(dto: any) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.resetPassword(dto.token, dto.newPassword || dto.new_password));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async verifyEmail(dto: any) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.verifyEmail(dto.email, dto.code));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async getMe(userId: string) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            const user = await service.getUserById(userId);
            return this.wrap(Promise.resolve(user.toJSON()));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async refresh(dto: any) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.refreshToken(dto.refreshToken || dto.refresh_token));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async changePassword(userId: string, dto: any) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.changePassword(userId, dto.currentPassword || dto.current_password, dto.newPassword || dto.new_password));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async generate2FASecret(userId: string, method: string = 'app', email?: string) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.generate2FASecret(userId, method as any, email));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async enable2FA(userId: string, code: string, method: string = 'app') {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.enable2FA(userId, code, method as any));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async disable2FA(userId: string) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.disable2FA(userId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async disable2FAMethod(userId: string, method: string) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.disable2FAMethod(userId, method as any));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async regenerateBackupCodes(userId: string) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.regenerateBackupCodes(userId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async getActiveSessions(userId: string) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.getActiveSessions(userId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async revokeSession(userId: string, sessionId: string) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.revokeSession(userId, sessionId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async getLoginHistory(userId: string) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.getLoginHistory(userId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }
}
