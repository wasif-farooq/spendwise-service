import { ServiceBootstrap } from '../../src/bootstrap/ServiceBootstrap';
import { ConfigLoader } from '@config/ConfigLoader';
import { TOKENS } from '@di/tokens';
import { Container } from '@di/Container';
import { AuthService } from '@domains/auth/services/AuthService';
import { UserService } from '@domains/users/services/UserService';
import { WorkspaceService } from '@domains/workspaces/services/WorkspaceService';
import { FeatureFlagService } from '@domains/feature-flags/services/FeatureFlagService';
import { AppError } from '@shared/errors/AppError';
import { ReportService } from '../../src/domains/reports/services/ReportService';
import { ExportReportRequest } from '../../src/domains/reports/types';
import { RpcClientFactory } from '../../src/messaging/factories/RpcClientFactory';
import { IRpcClient } from '../../src/messaging/interfaces/IRpcClient';

// Consolidate Worker Logic
const startWorker = async () => {
    const bootstrap = ServiceBootstrap.getInstance();
    await bootstrap.initialize('Unified Worker');

    const rpcClient: IRpcClient = RpcClientFactory.create();
    await rpcClient.connect();

    if ('startListening' in rpcClient) {
        await (rpcClient as any).startListening();
    }

    const container = Container.getInstance();
    const serviceFactory = container.resolve<any>(TOKENS.ServiceFactory);

    const authService = await serviceFactory.createAuthService() as AuthService;
    const userService = serviceFactory.createUserService() as UserService;
    const workspaceService = serviceFactory.createWorkspaceService() as WorkspaceService;
    const featureFlagService = serviceFactory.createFeatureFlagService() as FeatureFlagService;
    const reportService = serviceFactory.createReportService() as ReportService;

    console.log('Unified Worker Listening...');

    const handleMessage = async (payload: any, correlationId?: string): Promise<any> => {
        const topic = payload._topic || '';
        let result: any;

                // --- Auth Handling ---
                if (topic === 'auth.service.login') {
                    console.log(`[Auth] Processing Login for ${correlationId}`);
                    result = await authService.login(payload);
                } else if (topic === 'auth.service.register') {
                    console.log(`[Auth] Processing Register for ${correlationId}`);
                    result = await authService.register(payload);
                } else if (topic === 'auth.service.verify-2fa') {
                    console.log(`[Auth] Processing Verify 2FA for ${correlationId}`);
                    // Note: verify2FA expects (tempToken, code, method)
                    result = await authService.verify2FA(payload.tempToken, payload.code, payload.method);
                } else if (topic === 'auth.service.resend-2fa') {
                    console.log(`[Auth] Processing Resend 2FA for ${correlationId}`);
                    result = await authService.resend2FA(payload.tempToken, payload.method);
                } else if (topic === 'auth.service.verify-backup-code') {
                    console.log(`[Auth] Processing Verify Backup Code for ${correlationId}`);
                    result = await authService.verifyBackupCode(payload.tempToken, payload.code);
                } else if (topic === 'auth.service.forgot-password') {
                    console.log(`[Auth] Processing Forgot Password for ${correlationId}`);
                    result = await authService.forgotPassword(payload.email);
                } else if (topic === 'auth.service.verify-reset-code') {
                    console.log(`[Auth] Processing Verify Reset Code for ${correlationId}`);
                    result = await authService.verifyResetCode(payload.email, payload.code);
                } else if (topic === 'auth.service.reset-password') {
                    console.log(`[Auth] Processing Reset Password for ${correlationId}`);
                    result = await authService.resetPassword(payload.token, payload.newPassword);
                } else if (topic === 'auth.service.verify-email') {
                    console.log(`[Auth] Processing Verify Email for ${correlationId}`);
                    result = await authService.verifyEmail(payload.email, payload.code);
                } else if (topic === 'auth.service.get-me') {
                    console.log(`[Auth] Processing GetMe for ${correlationId}`);
                    result = await authService.getUserById(payload.userId);
                } else if (topic === 'auth.service.change-password') {
                    console.log(`[Auth] Processing Change Password for ${correlationId}`);
                    result = await authService.changePassword(payload.userId, payload.oldPassword, payload.newPassword);
                } else if (topic === 'auth.service.generate-2fa-secret') {
                    console.log(`[Auth] Processing Generate 2FA Secret for ${correlationId}`);
                    result = await authService.generate2FASecret(payload.userId, payload.method, payload.email);
                } else if (topic === 'auth.service.enable-2fa') {
                    console.log(`[Auth] Processing Enable 2FA for ${correlationId}`);
                    result = await authService.enable2FA(payload.userId, payload.code, payload.method);
                } else if (topic === 'auth.service.disable-2fa') {
                    console.log(`[Auth] Processing Disable 2FA for ${correlationId}`);
                    result = await authService.disable2FA(payload.userId);
                } else if (topic === 'auth.service.disable-2fa-method') {
                    console.log(`[Auth] Processing Disable 2FA Method for ${correlationId}`);
                    result = await authService.disable2FAMethod(payload.userId, payload.method);
                } else if (topic === 'auth.service.regenerate-backup-codes') {
                    console.log(`[Auth] Processing Regenerate Backup Codes for ${correlationId}`);
                    result = await authService.regenerateBackupCodes(payload.userId);
                } else if (topic === 'auth.service.get-active-sessions') {
                    console.log(`[Auth] Processing Get Active Sessions for ${correlationId}`);
                    result = await authService.getActiveSessions(payload.userId);
                } else if (topic === 'auth.service.revoke-session') {
                    console.log(`[Auth] Processing Revoke Session for ${correlationId}`);
                    result = await authService.revokeSession(payload.userId, payload.sessionId);
                } else if (topic === 'auth.service.get-login-history') {
                    console.log(`[Auth] Processing Get Login History for ${correlationId}`);
                    result = await authService.getLoginHistory(payload.userId);
                }

                // --- User Handling ---
                else if (topic === 'user.service.getProfile') {
                    console.log(`[User] Processing GetProfile for ${correlationId}`);
                    result = await userService.getProfile(payload.userId);
                } else if (topic === 'user.service.updateProfile') {
                    console.log(`[User] Processing UpdateProfile for ${correlationId}`);
                    const { userId, ...data } = payload;
                    result = await userService.updateProfile(userId, data);
                } else if (topic === 'user.service.getPreferences') {
                    console.log(`[User] Processing GetPreferences for ${correlationId}`);
                    const pref = await (authService as any).userPreferencesService.getPreferences(payload.userId);
                    result = pref.toDTO();
                } else if (topic === 'user.service.updatePreferences') {
                    console.log(`[User] Processing UpdatePreferences for ${correlationId}`);
                    const { userId, ...data } = payload;
                    const pref = await (authService as any).userPreferencesService.updatePreferences(userId, data);
                    result = pref.toDTO();
                }

                // --- Workspace Handling ---
                else if (topic === 'workspace.service.update') {
                    console.log(`[Workspace] Processing Update for ${correlationId}`);
                    result = await workspaceService.update(payload.workspaceId, payload.userId, payload);
                } else if (topic === 'workspace.service.delete') {
                    console.log(`[Workspace] Processing Delete for ${correlationId}`);
                    result = await workspaceService.delete(payload.workspaceId, payload.userId);
                } else if (topic === 'workspace.service.list') {
                    console.log(`[Workspace] Processing List for ${correlationId}`);
                    result = await workspaceService.getUserWorkspaces(payload.userId);
                } else if (topic === 'workspace.service.get-members') {
                    console.log(`[Workspace] Processing GetMembers for ${correlationId}`);
                    result = await workspaceService.getMembers(payload.workspaceId, payload.userId);
                } else if (topic === 'workspace.service.invite-member') {
                    console.log(`[Workspace] Processing InviteMember for ${correlationId}`);
                    result = await workspaceService.inviteMember(payload.workspaceId, payload.userId, payload);
                } else if (topic === 'workspace.service.remove-member') {
                    console.log(`[Workspace] Processing RemoveMember for ${correlationId}`);
                    result = await workspaceService.removeMember(payload.workspaceId, payload.userId, payload.memberId);
                } else if (topic === 'workspace.service.get-roles') {
                    console.log(`[Workspace] Processing GetRoles for ${correlationId}`);
                    result = await workspaceService.getRoles(payload.workspaceId, payload.userId, payload);
                } else if (topic === 'workspace.service.get-role') {
                    console.log(`[Workspace] Processing GetRole for ${correlationId}`);
                    result = await workspaceService.getRole(payload.workspaceId, payload.userId, payload.roleId);
                } else if (topic === 'workspace.service.create-role') {
                    console.log(`[Workspace] Processing CreateRole for ${correlationId}`);
                    result = await workspaceService.createRole(payload.workspaceId, payload.userId, payload);
                } else if (topic === 'workspace.service.update-role') {
                    console.log(`[Workspace] Processing UpdateRole for ${correlationId}`);
                    result = await workspaceService.updateRole(payload.workspaceId, payload.userId, payload.roleId, payload.permissions);
                } else if (topic === 'workspace.service.assign-role') {
                    console.log(`[Workspace] Processing AssignRole for ${correlationId}`);
                    result = await workspaceService.assignRole(payload.workspaceId, payload.userId, payload.memberId, payload.roleId);
                } else if (topic === 'workspace.service.delete-role') {
                    console.log(`[Workspace] Processing DeleteRole for ${correlationId}`);
                    result = await workspaceService.deleteRole(payload.workspaceId, payload.userId, payload.roleId);
                } else if (topic === 'workspace.service.create') {
                    console.log(`[Workspace] Processing Create for ${correlationId}`);
                    result = await workspaceService.create(payload.userId, payload);
                } else if (topic === 'workspace.service.check-permission') {
                    console.log(`[Workspace] Processing CheckPermission for ${correlationId}`);
                    result = await workspaceService.checkPermission(payload.workspaceId, payload.userId, payload.permission);
                }

                // --- Feature Flag Handling ---
                else if (topic === 'feature-flags.service.get-all') {
                    console.log(`[FeatureFlags] Processing GetAll for ${correlationId}`);
                    result = await featureFlagService.getAllFlags();
                }

                // --- Report Handling (Fire & Forget - No Reply) ---
                else if (topic === 'reports.export') {
                    console.log(`[Report] Processing Export request for workspace ${payload.workspaceId}`);
                    try {
                        await reportService.handleExportRequest(payload as ExportReportRequest);
                        console.log(`[Report] Export completed for ${payload.userEmail}`);
                    } catch (error: any) {
                        console.error(`[Report] Export failed:`, error);
                    }
                }

        return result;
    };

    await rpcClient.subscribe('auth.service.login', handleMessage);
    await rpcClient.subscribe('auth.service.register', handleMessage);
    await rpcClient.subscribe('auth.service.verify-2fa', handleMessage);
    await rpcClient.subscribe('auth.service.resend-2fa', handleMessage);
    await rpcClient.subscribe('auth.service.verify-backup-code', handleMessage);
    await rpcClient.subscribe('auth.service.forgot-password', handleMessage);
    await rpcClient.subscribe('auth.service.verify-reset-code', handleMessage);
    await rpcClient.subscribe('auth.service.reset-password', handleMessage);
    await rpcClient.subscribe('auth.service.verify-email', handleMessage);
    await rpcClient.subscribe('auth.service.get-me', handleMessage);
    await rpcClient.subscribe('auth.service.change-password', handleMessage);
    await rpcClient.subscribe('auth.service.generate-2fa-secret', handleMessage);
    await rpcClient.subscribe('auth.service.enable-2fa', handleMessage);
    await rpcClient.subscribe('auth.service.disable-2fa', handleMessage);
    await rpcClient.subscribe('auth.service.disable-2fa-method', handleMessage);
    await rpcClient.subscribe('auth.service.regenerate-backup-codes', handleMessage);
    await rpcClient.subscribe('auth.service.get-active-sessions', handleMessage);
    await rpcClient.subscribe('auth.service.revoke-session', handleMessage);
    await rpcClient.subscribe('auth.service.get-login-history', handleMessage);

    await rpcClient.subscribe('user.service.getProfile', handleMessage);
    await rpcClient.subscribe('user.service.updateProfile', handleMessage);
    await rpcClient.subscribe('user.service.getPreferences', handleMessage);
    await rpcClient.subscribe('user.service.updatePreferences', handleMessage);

    await rpcClient.subscribe('workspace.service.create', handleMessage);
    await rpcClient.subscribe('workspace.service.update', handleMessage);
    await rpcClient.subscribe('workspace.service.delete', handleMessage);
    await rpcClient.subscribe('workspace.service.list', handleMessage);
    await rpcClient.subscribe('workspace.service.get-members', handleMessage);
    await rpcClient.subscribe('workspace.service.invite-member', handleMessage);
    await rpcClient.subscribe('workspace.service.remove-member', handleMessage);
    await rpcClient.subscribe('workspace.service.get-roles', handleMessage);
    await rpcClient.subscribe('workspace.service.get-role', handleMessage);
    await rpcClient.subscribe('workspace.service.create-role', handleMessage);
    await rpcClient.subscribe('workspace.service.update-role', handleMessage);
    await rpcClient.subscribe('workspace.service.assign-role', handleMessage);
    await rpcClient.subscribe('workspace.service.delete-role', handleMessage);
    await rpcClient.subscribe('workspace.service.check-permission', handleMessage);

    await rpcClient.subscribe('feature-flags.service.get-all', handleMessage);

    await rpcClient.subscribe('reports.export', handleMessage);

    console.log('[Worker] All topics subscribed');
};

startWorker().catch(console.error);
