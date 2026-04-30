import { Router } from 'express';
import { TOKENS } from '@di/tokens';
import { controllerMiddleware } from '@shared/middlewares/controller.middleware';
import { validate } from '@shared/middleware/validate.middleware';
import { requireAuth } from '@shared/middleware/auth.middleware';
import {
    registerSchema,
    loginSchema,
    verify2faSchema,
    resend2faSchema,
    verifyBackupCodeSchema,
    forgotPasswordSchema,
    verifyResetCodeSchema,
    resetPasswordSchema,
    verifyEmailSchema
} from '../validators/auth.validation';

const router = Router();

router.use(controllerMiddleware(TOKENS.AuthControllerFactory));

router.get('/me', requireAuth, (req, res, next) => req.controller.getMe(req, res).catch(next));
router.post('/login', validate(loginSchema), (req, res, next) => req.controller.login(req, res).catch(next));
router.post('/register', validate(registerSchema), (req, res, next) => req.controller.register(req, res).catch(next));
router.post('/refresh', (req, res, next) => req.controller.refresh(req, res).catch(next));

router.post('/verify-2fa', validate(verify2faSchema), (req, res, next) => req.controller.verify2FA(req, res).catch(next));
router.post('/resend-2fa', validate(resend2faSchema), (req, res, next) => req.controller.resend2FA(req, res).catch(next));
router.post('/verify-backup-code', validate(verifyBackupCodeSchema), (req, res, next) => req.controller.verifyBackupCode(req, res).catch(next));

router.post('/forgot-password', validate(forgotPasswordSchema), (req, res, next) => req.controller.forgotPassword(req, res).catch(next));
router.post('/verify-reset-code', validate(verifyResetCodeSchema), (req, res, next) => req.controller.verifyResetCode(req, res).catch(next));
router.post('/reset-password', validate(resetPasswordSchema), (req, res, next) => req.controller.resetPassword(req, res).catch(next));
router.post('/verify-email', validate(verifyEmailSchema), (req, res, next) => req.controller.verifyEmail(req, res).catch(next));
router.put('/change-password', requireAuth, (req, res, next) => req.controller.changePassword(req, res).catch(next));

export default router;