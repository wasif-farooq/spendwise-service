import { Router } from 'express';
import { TOKENS } from '@di/tokens';
import { controllerMiddleware } from '@shared/middlewares/controller.middleware';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';

const router = Router({ mergeParams: true });

router.use(controllerMiddleware(TOKENS.WorkspaceRolesControllerFactory));
router.use(requireAuth);

router.get('/', requirePermission('roles:view'), (req, res) => req.controller.list(req, res));
router.get('/:roleId', requirePermission('roles:view'), (req, res) => req.controller.getById(req, res));
router.post('/', requirePermission('roles:create'), (req, res) => req.controller.create(req, res));
router.put('/:roleId', requirePermission('roles:edit'), (req, res) => req.controller.update(req, res));
router.delete('/:roleId', requirePermission('roles:delete'), (req, res) => req.controller.delete(req, res));
router.put('/members/:memberId', requirePermission('members:edit'), (req, res) => req.controller.assign(req, res));

export default router;