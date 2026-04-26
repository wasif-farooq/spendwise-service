import { Router } from 'express';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { WorkspaceRequestRepository } from  '@domains/workspaces/repositories/WorkspaceRequestRepository';
import { WorkspaceController } from  '@domains/workspaces/controllers/WorkspaceController';

const router = Router();

const container = Container.getInstance();
const factory = container.resolve<any>(TOKENS.WorkspaceControllerFactory);
const controller = factory.create();

// GET /accept - lookup invitation by token (for preview before accepting)
router.get('/accept', controller.getInvitationByToken.bind(controller));
// POST /accept - accept the invitation
router.post('/accept', controller.acceptInvitation.bind(controller));
// POST /decline - decline the invitation
router.post('/decline', controller.declineInvitation.bind(controller));

export default router;