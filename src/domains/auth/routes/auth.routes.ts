import { Router } from 'express';
import { AuthControllerFactory } from '@factories/AuthControllerFactory';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
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
const container = Container.getInstance();
const factory = container.resolve<AuthControllerFactory>(TOKENS.AuthControllerFactory);
const controller = factory.create();

router.get('/me', requireAuth, controller.getMe.bind(controller));
router.post('/login', validate(loginSchema), controller.login.bind(controller));
router.post('/register', validate(registerSchema), controller.register.bind(controller));
router.post('/refresh', controller.refresh.bind(controller));

router.post('/verify-2fa', validate(verify2faSchema), controller.verify2FA.bind(controller));
router.post('/resend-2fa', validate(resend2faSchema), controller.resend2FA.bind(controller));
router.post('/verify-backup-code', validate(verifyBackupCodeSchema), controller.verifyBackupCode.bind(controller));

router.post('/forgot-password', validate(forgotPasswordSchema), controller.forgotPassword.bind(controller));
router.post('/verify-reset-code', validate(verifyResetCodeSchema), controller.verifyResetCode.bind(controller));
router.post('/reset-password', validate(resetPasswordSchema), controller.resetPassword.bind(controller));
router.post('/verify-email', validate(verifyEmailSchema), controller.verifyEmail.bind(controller));
router.put('/change-password', requireAuth, controller.changePassword.bind(controller));

export default router;
