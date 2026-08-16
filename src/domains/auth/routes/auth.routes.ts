import { Router } from 'express';
import { TOKENS } from '@di/tokens';
import { controllerMiddleware } from '@shared/middlewares/controller.middleware';
import { validate } from '@shared/middleware/validate.middleware';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { authRateLimits } from '@shared/middleware/rateLimit.middleware';
import {
  registerSchema,
  loginSchema,
  verify2faSchema,
  resend2faSchema,
  verifyBackupCodeSchema,
  forgotPasswordSchema,
  verifyResetCodeSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  changePasswordSchema,
} from '../validators/auth.validation';

const router = Router();

router.use(controllerMiddleware(TOKENS.AuthControllerFactory));

router.get('/me', requireAuth, (req, res, next) => req.controller.getMe(req, res).catch(next));
router.post('/login', authRateLimits.login, validate(loginSchema), (req, res, next) =>
  req.controller.login(req, res).catch(next),
);
router.post('/register', authRateLimits.register, validate(registerSchema), (req, res, next) =>
  req.controller.register(req, res).catch(next),
);
router.post('/refresh', authRateLimits.refresh, (req, res, next) =>
  req.controller.refresh(req, res).catch(next),
);
router.post('/google', authRateLimits.login, (req, res, next) =>
  req.controller.googleLogin(req, res).catch(next),
);

router.post(
  '/verify-2fa',
  authRateLimits.codeVerification,
  validate(verify2faSchema),
  (req, res, next) => req.controller.verify2FA(req, res).catch(next),
);
router.post('/resend-2fa', authRateLimits.codeResend, validate(resend2faSchema), (req, res, next) =>
  req.controller.resend2FA(req, res).catch(next),
);
router.post(
  '/verify-backup-code',
  authRateLimits.codeVerification,
  validate(verifyBackupCodeSchema),
  (req, res, next) => req.controller.verifyBackupCode(req, res).catch(next),
);

router.post(
  '/forgot-password',
  authRateLimits.passwordReset,
  validate(forgotPasswordSchema),
  (req, res, next) => req.controller.forgotPassword(req, res).catch(next),
);
router.post(
  '/verify-reset-code',
  authRateLimits.codeVerification,
  validate(verifyResetCodeSchema),
  (req, res, next) => req.controller.verifyResetCode(req, res).catch(next),
);
router.post(
  '/reset-password',
  authRateLimits.codeVerification,
  validate(resetPasswordSchema),
  (req, res, next) => req.controller.resetPassword(req, res).catch(next),
);
router.post(
  '/verify-email',
  authRateLimits.codeVerification,
  validate(verifyEmailSchema),
  (req, res, next) => req.controller.verifyEmail(req, res).catch(next),
);
router.put(
  '/change-password',
  authRateLimits.passwordChange,
  requireAuth,
  validate(changePasswordSchema),
  (req, res, next) => req.controller.changePassword(req, res).catch(next),
);

export default router;
