import { Router } from 'express';
import multer from 'multer';
import { TOKENS } from '@di/tokens';
import { controllerMiddleware } from '@shared/middlewares/controller.middleware';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';

import workspaceRolesRoutes from './workspace-roles.routes';

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: parseInt(process.env.STORAGE_MAX_FILE_SIZE || '10485760'), // 10MB
    },
});

router.use(controllerMiddleware(TOKENS.WorkspaceControllerFactory));
router.use(requireAuth); // Protect all routes

router.post('/', (req, res) => req.controller.create(req, res));
router.get('/', (req, res) => req.controller.getAll(req, res));
router.get('/:workspaceId/me', (req, res) => req.controller.getMe(req, res));
router.get('/:workspaceId', (req, res) => req.controller.getById(req, res));
router.put('/:workspaceId', requirePermission('workspace:update'), (req, res) => req.controller.update(req, res));
router.delete('/:workspaceId', requirePermission('workspace:delete'), (req, res) => req.controller.delete(req, res));

router.use('/:workspaceId/roles', workspaceRolesRoutes);

router.post('/:workspaceId/members/invite', requirePermission('members:create'), (req, res) => req.controller.inviteMember(req, res));
router.get('/:workspaceId/members/invitations', (req, res) => req.controller.getInvitations(req, res));
router.post('/:workspaceId/members/resend/:invitationId', requirePermission('members:create'), (req, res) => req.controller.resendInvitation(req, res));
router.delete('/:workspaceId/members/invitations/:invitationId', requirePermission('members:delete'), (req, res) => req.controller.cancelInvitation(req, res));
router.post('/:workspaceId/members/invitations/:invitationId/cancel', requirePermission('members:delete'), (req, res) => req.controller.cancelInvitation(req, res));

router.get('/:workspaceId/members', (req, res) => req.controller.getMembers(req, res));
router.get('/:workspaceId/members/:memberId', (req, res) => req.controller.getMember(req, res));

router.put('/:workspaceId/members/:memberId', requirePermission('members:edit'), (req, res) => req.controller.updateMember(req, res));
router.delete('/:workspaceId/members/:memberId', requirePermission('members:delete'), (req, res) => req.controller.removeMember(req, res));

router.post('/:workspaceId/leave', (req, res) => req.controller.leave(req, res));

router.get('/invitations/me', (req, res) => req.controller.getMyInvitations(req, res));

export default router;