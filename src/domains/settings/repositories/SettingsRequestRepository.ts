import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { ServiceFactory } from '@factories/ServiceFactory';
import { UserPreferencesService } from '@domains/users/services/UserPreferencesService';
import { AuthRequestRepository } from '@domains/auth/repositories/AuthRequestRepository';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

export class SettingsRequestRepository {
    private config = ConfigLoader.getInstance();
    private cachedPreferencesService!: UserPreferencesService;
    private authRequestRepository: AuthRequestRepository | null = null;

    private getMode(): string {
        return this.config.get('repository.mode') || 'direct';
    }

    private getPreferencesService(): UserPreferencesService {
        if (this.cachedPreferencesService) {
            return this.cachedPreferencesService;
        }

        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const repoFactory = new RepositoryFactory(db);
        const serviceFactory = new ServiceFactory(repoFactory, db);

        this.cachedPreferencesService = serviceFactory.createUserPreferencesService();
        return this.cachedPreferencesService;
    }

    private getAuthRequestRepository(): AuthRequestRepository {
        if (this.authRequestRepository) {
            return this.authRequestRepository;
        }
        this.authRequestRepository = new AuthRequestRepository();
        return this.authRequestRepository;
    }

    private wrap(promise: Promise<any>): Promise<any> {
        return promise
            .then(data => ({ data, error: null, statusCode: 200 }))
            .catch(error => ({
                error: error.message || 'An error occurred',
                statusCode: error.statusCode || 500,
                data: null
            }));
    }

    async getPreferences(userId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getPreferencesService();
            const prefs = await service.getPreferences(userId);
            return this.wrap(Promise.resolve(prefs.toDTO()));
        }
        throw new Error('RPC mode not implemented');
    }

    async updatePreferences(userId: string, data: any) {
        if (this.getMode() === 'direct') {
            const service = this.getPreferencesService();
            const prefs = await service.updatePreferences(userId, data);
            return this.wrap(Promise.resolve(prefs.toDTO()));
        }
        throw new Error('RPC mode not implemented');
    }

    async getSecuritySettings(userId: string) {
        if (this.getMode() === 'direct') {
            const authRepo = this.getAuthRequestRepository();
            return authRepo.getMe(userId);
        }
        throw new Error('RPC mode not implemented');
    }

    async changePassword(userId: string, data: { currentPassword: string; newPassword: string }) {
        if (this.getMode() === 'direct') {
            const authRepo = this.getAuthRequestRepository();
            return authRepo.changePassword(userId, data);
        }
        throw new Error('RPC mode not implemented');
    }

    async setup2FA(userId: string, data: { method: string; email?: string }) {
        if (this.getMode() === 'direct') {
            const authRepo = this.getAuthRequestRepository();
            return authRepo.generate2FASecret(userId, data.method, data.email);
        }
        throw new Error('RPC mode not implemented');
    }

    async enable2FA(userId: string, data: { code: string; method: string }) {
        if (this.getMode() === 'direct') {
            const authRepo = this.getAuthRequestRepository();
            return authRepo.enable2FA(userId, data.code, data.method);
        }
        throw new Error('RPC mode not implemented');
    }

    async disable2FA(userId: string) {
        if (this.getMode() === 'direct') {
            const authRepo = this.getAuthRequestRepository();
            return authRepo.disable2FA(userId);
        }
        throw new Error('RPC mode not implemented');
    }

    async regenerateBackupCodes(userId: string) {
        if (this.getMode() === 'direct') {
            const authRepo = this.getAuthRequestRepository();
            return authRepo.regenerateBackupCodes(userId);
        }
        throw new Error('RPC mode not implemented');
    }

    async getActiveSessions(userId: string) {
        if (this.getMode() === 'direct') {
            const authRepo = this.getAuthRequestRepository();
            return authRepo.getActiveSessions(userId);
        }
        throw new Error('RPC mode not implemented');
    }

    async revokeSession(userId: string, sessionId: string) {
        if (this.getMode() === 'direct') {
            const authRepo = this.getAuthRequestRepository();
            return authRepo.revokeSession(userId, sessionId);
        }
        throw new Error('RPC mode not implemented');
    }

    async getLoginHistory(userId: string) {
        if (this.getMode() === 'direct') {
            const authRepo = this.getAuthRequestRepository();
            return authRepo.getLoginHistory(userId);
        }
        throw new Error('RPC mode not implemented');
    }
}