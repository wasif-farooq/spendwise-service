import { Router } from 'express';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';
import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';
import { WorkspaceRolesController } from '@domains/workspaces/controllers/WorkspaceRolesController';

const router = Router({ mergeParams: true });

const container = Container.getInstance();
const factory = container.resolve<any>(TOKENS.WorkspaceControllerFactory);
const controller = new WorkspaceRolesController(new WorkspaceRequestRepository());

// Protected all routes
router.use(requireAuth);

// Note: These route names match WorkspaceRolesController methods
router.get('/', requirePermission('roles:view'), controller.list.bind(controller));
router.get('/:roleId', requirePermission('roles:view'), controller.getById.bind(controller));
router.post('/', requirePermission('roles:create'), controller.create.bind(controller));
router.put('/:roleId', requirePermission('roles:edit'), controller.update.bind(controller));
router.delete('/:roleId', requirePermission('roles:delete'), controller.delete.bind(controller));
router.put('/members/:memberId', requirePermission('members:edit'), controller.assign.bind(controller));
// Note: duplicate role endpoint removed - not needed for now

export default router;
