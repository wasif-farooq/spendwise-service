import { Router } from 'express';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { SettingsControllerFactory } from '@factories/SettingsControllerFactory';

const router = Router();

const factory = new SettingsControllerFactory();
const controller = factory.create();

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
