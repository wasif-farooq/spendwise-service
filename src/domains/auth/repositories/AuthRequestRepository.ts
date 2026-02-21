import { KafkaRequestReply } from '@messaging/implementations/kafka/KafkaRequestReply';
import { LoginDto, RegisterDto } from '@domains/auth/dto/auth.dto';

export class AuthRequestRepository {
    private rpcClient: KafkaRequestReply;

    constructor(autoConnect: boolean = true) {
        this.rpcClient = new KafkaRequestReply();
        if (autoConnect) {
            this.rpcClient.connect().catch(err => console.error('Failed to connect RPC Client', err));
        }
    }

    async login(dto: LoginDto) {
        return this.rpcClient.request('auth.service.login', dto);
    }

    async register(dto: RegisterDto) {
        return this.rpcClient.request('auth.service.register', dto);
    }

    async verify2FA(dto: any) {
        return this.rpcClient.request('auth.service.verify-2fa', dto);
    }

    async resend2FA(dto: any) {
        return this.rpcClient.request('auth.service.resend-2fa', dto);
    }

    async verifyBackupCode(dto: any) {
        return this.rpcClient.request('auth.service.verify-backup-code', dto);
    }

    async forgotPassword(dto: any) {
        return this.rpcClient.request('auth.service.forgot-password', dto);
    }

    async verifyResetCode(dto: any) {
        return this.rpcClient.request('auth.service.verify-reset-code', dto);
    }

    async resetPassword(dto: any) {
        return this.rpcClient.request('auth.service.reset-password', dto);
    }

    async verifyEmail(dto: { email: string, code: string }) {
        return this.rpcClient.request('auth.service.verify-email', dto);
    }

    async getMe(userId: string) {
        return this.rpcClient.request('auth.service.get-me', { userId });
    }

    async refresh(dto: { refreshToken: string }) {
        return this.rpcClient.request('auth.service.refresh', dto);
    }

    async changePassword(userId: string, dto: any) {
        return this.rpcClient.request('auth.service.change-password', { userId, ...dto });
    }

    async generate2FASecret(userId: string, method: string = 'app', email?: string) {
        return this.rpcClient.request('auth.service.generate-2fa-secret', { userId, method, email });
    }

    async enable2FA(userId: string, code: string, method: string = 'app') {
        return this.rpcClient.request('auth.service.enable-2fa', { userId, code, method });
    }

    async disable2FA(userId: string) {
        return this.rpcClient.request('auth.service.disable-2fa', { userId });
    }

    async disable2FAMethod(userId: string, method: string) {
        return this.rpcClient.request('auth.service.disable-2fa-method', { userId, method });
    }

    async regenerateBackupCodes(userId: string) {
        return this.rpcClient.request('auth.service.regenerate-backup-codes', { userId });
    }

    async getActiveSessions(userId: string) {
        return this.rpcClient.request('auth.service.get-active-sessions', { userId });
    }

    async revokeSession(userId: string, sessionId: string) {
        return this.rpcClient.request('auth.service.revoke-session', { userId, sessionId });
    }

    async getLoginHistory(userId: string) {
        return this.rpcClient.request('auth.service.get-login-history', { userId });
    }
}
