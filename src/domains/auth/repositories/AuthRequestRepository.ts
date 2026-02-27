import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { PostgresFactory } from '@database/factories/PostgresFactory';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { ServiceFactory } from '@factories/ServiceFactory';

export class AuthRequestRepository {
    private config = ConfigLoader.getInstance();
    private getMode(): string {
        return this.config.get('repository.mode') || 'direct';
    }

    // Get the service using ServiceFactory
    private get service() {
        const db = new DatabaseFacade(new PostgresFactory());
        const repoFactory = new RepositoryFactory(db);
        const serviceFactory = new ServiceFactory(repoFactory, db);
        return serviceFactory.createAuthService();
    }

    // Helper to wrap responses in RPC-style format
    private wrap(promise: Promise<any>): Promise<any> {
        return promise
            .then(data => ({ ...data, error: null, statusCode: 200 }))
            .catch(error => ({ 
                error: error.message || 'An error occurred', 
                statusCode: error.statusCode || 500,
                data: null 
            }));
    }

    async login(dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.login(dto));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async register(dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.register(dto));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async verify2FA(dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.verify2FA(dto.tempToken || dto.temp_token, dto.code, dto.method));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async resend2FA(dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.resend2FA(dto.tempToken || dto.temp_token, dto.method));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async verifyBackupCode(dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.verifyBackupCode(dto.tempToken || dto.temp_token, dto.code));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async forgotPassword(dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.forgotPassword(dto.email));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async verifyResetCode(dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.verifyResetCode(dto.email, dto.code));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async resetPassword(dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.resetPassword(dto.token, dto.newPassword || dto.new_password));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async verifyEmail(dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.verifyEmail(dto.email, dto.code));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async getMe(userId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.getUserById(userId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async refresh(dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.refreshToken(dto.refreshToken || dto.refresh_token));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async changePassword(userId: string, dto: any) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.changePassword(userId, dto.currentPassword || dto.current_password, dto.newPassword || dto.new_password));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async generate2FASecret(userId: string, method: string = 'app', email?: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.generate2FASecret(userId, method as any, email));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async enable2FA(userId: string, code: string, method: string = 'app') {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.enable2FA(userId, code, method as any));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async disable2FA(userId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.disable2FA(userId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async disable2FAMethod(userId: string, method: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.disable2FAMethod(userId, method as any));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async regenerateBackupCodes(userId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.regenerateBackupCodes(userId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async getActiveSessions(userId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.getActiveSessions(userId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async revokeSession(userId: string, sessionId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.revokeSession(userId, sessionId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }

    async getLoginHistory(userId: string) {
        if (this.getMode() === 'direct') {
            return this.wrap(this.service.getLoginHistory(userId));
        }
        throw new Error('RPC mode not implemented in this wrapper');
    }
}
