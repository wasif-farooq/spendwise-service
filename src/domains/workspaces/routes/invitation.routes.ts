import { Router } from 'express';
import { TOKENS } from '@di/tokens';
import { controllerMiddleware } from '@shared/middlewares/controller.middleware';

const router = Router();

router.use(controllerMiddleware(TOKENS.WorkspaceControllerFactory));

router.get('/accept', (req, res) => req.controller.getInvitationByToken(req, res));
router.post('/accept', (req, res) => req.controller.acceptInvitation(req, res));
router.post('/decline', (req, res) => req.controller.declineInvitation(req, res));

export default router;