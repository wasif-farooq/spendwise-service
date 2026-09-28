import { Router } from 'express';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { validateBody, validateParams } from '@shared/middleware/validateBody.middleware';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { PostgresFactory } from '@database/factories/PostgresFactory';
import { PushTokenController } from '../controllers/PushTokenController';
import { PushTokenRepository } from '../repositories/PushTokenRepository';
import { PushTokenService } from '../services/PushTokenService';
import { PushTokenParamsSchema, RegisterPushTokenSchema } from '../validators/pushToken.validation';

/**
 * Push token registration for the mobile app (at /v1/notifications/push-tokens):
 *   POST   /            { token, platform, deviceName?, appVersion? } → 201 { data }
 *   DELETE /:token      → 204 (URL-encoded token; only the caller's own token is removed)
 */
export const createPushTokenRouter = (controller: PushTokenController) => {
  const router = Router();
  router.use(requireAuth);
  router.post('/', validateBody(RegisterPushTokenSchema), controller.register.bind(controller));
  router.delete(
    '/:token',
    validateParams(PushTokenParamsSchema),
    controller.unregister.bind(controller),
  );
  return router;
};

const db = new DatabaseFacade(new PostgresFactory());
const controller = new PushTokenController(new PushTokenService(new PushTokenRepository(db)));

export default createPushTokenRouter(controller);
