import { Router } from 'express';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { SettingsController } from './SettingsController';
import { UserRequestRepository } from '@domains/users/repositories/UserRequestRepository';
import { AuthRequestRepository } from '@domains/auth/repositories/AuthRequestRepository';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

const router = Router();

// Resolve dependencies
const container = Container.getInstance();
const userRequestRepository = new UserRequestRepository();
const authRequestRepository = new AuthRequestRepository();

const controller = new SettingsController(userRequestRepository, authRequestRepository);

router.use(requireAuth);

router.get('/preferences', controller.getPreferences.bind(controller));
router.put('/preferences', controller.updatePreferences.bind(controller));
router.get('/security', controller.getSecuritySettings.bind(controller));
router.put('/change-password', controller.changePassword.bind(controller));
router.post('/2fa/setup', controller.setup2FA.bind(controller));
router.post('/2fa/enable', controller.enable2FA.bind(controller));
router.post('/2fa/disable', controller.disable2FA.bind(controller));
router.delete('/2fa/methods/:method', controller.delete2FAMethod.bind(controller));
router.post('/2fa/regenerate-codes', controller.regenerateBackupCodes.bind(controller));

// Session & History
router.get('/sessions', controller.getActiveSessions.bind(controller));
router.post('/sessions/:sessionId/revoke', controller.revokeSession.bind(controller));
router.get('/login-history', controller.getLoginHistory.bind(controller));


export default router;
