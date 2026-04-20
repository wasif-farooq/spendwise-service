import { Router } from 'express';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';
import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';

const router = Router({ mergeParams: true });

const container = Container.getInstance();
const factory = container.resolve<any>(TOKENS.WorkspaceControllerFactory);
const controller = factory.create();

// Protected all routes
router.use(requireAuth);

// Permission checks enabled with caching for fast performance
router.get('/', requirePermission('roles:view'), controller.listRoles.bind(controller));
router.get('/:roleId', requirePermission('roles:view'), controller.getRole.bind(controller));
router.post('/', requirePermission('roles:create'), controller.createRole.bind(controller));
router.put('/:roleId', requirePermission('roles:edit'), controller.updateRole.bind(controller));
router.delete('/:roleId', requirePermission('roles:delete'), controller.deleteRole.bind(controller));
router.put('/members/:memberId', requirePermission('members:edit'), controller.assignRole.bind(controller));
router.post('/:roleId/duplicate', requirePermission('roles:create'), controller.duplicateRole.bind(controller));

export default router;
