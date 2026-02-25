import { Router } from 'express';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';
import { WorkspaceRequestRepository } from  '@domains/workspaces/repositories/WorkspaceRequestRepository';
import { WorkspaceController } from  '@domains/workspaces/controllers/WorkspaceController';

import workspaceRolesRoutes from './workspace-roles.routes';

const router = Router();

const container = Container.getInstance();
const factory = container.resolve<any>(TOKENS.WorkspaceControllerFactory);
const controller = factory.create();

router.use(requireAuth); // Protect all routes

router.post('/', controller.create.bind(controller));
router.get('/', controller.list.bind(controller));
router.put('/:id', requirePermission('workspace:update'), controller.update.bind(controller));
router.delete('/:id', requirePermission('workspace:delete'), controller.delete.bind(controller));

router.get('/:id/members', controller.getMembers.bind(controller));
router.post('/:id/members/invite', requirePermission('members:create'), controller.inviteMember.bind(controller));
router.delete('/:id/members/:memberId', requirePermission('members:delete'), controller.removeMember.bind(controller));

router.use('/:id/roles', workspaceRolesRoutes);

export default router;
