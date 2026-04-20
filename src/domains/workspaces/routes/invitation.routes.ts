import { Router } from 'express';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { WorkspaceRequestRepository } from  '@domains/workspaces/repositories/WorkspaceRequestRepository';
import { WorkspaceController } from  '@domains/workspaces/controllers/WorkspaceController';

const router = Router();

const container = Container.getInstance();
const factory = container.resolve<any>(TOKENS.WorkspaceControllerFactory);
const controller = factory.create();

router.post('/accept', controller.acceptInvitation.bind(controller));

export default router;