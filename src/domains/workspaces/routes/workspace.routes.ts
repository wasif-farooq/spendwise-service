import { Router } from 'express';
import multer from 'multer';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { requireAuth } from '@shared/middleware/auth.middleware';
import { requirePermission } from '@shared/middleware/permission.middleware';
import { WorkspaceRequestRepository } from  '@domains/workspaces/repositories/WorkspaceRequestRepository';
import { WorkspaceController } from  '@domains/workspaces/controllers/WorkspaceController';

import workspaceRolesRoutes from './workspace-roles.routes';

const router = Router();

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: parseInt(process.env.STORAGE_MAX_FILE_SIZE || '10485760'), // 10MB
    },
});

const container = Container.getInstance();
const factory = container.resolve<any>(TOKENS.WorkspaceControllerFactory);
const controller = factory.create();

router.use(requireAuth); // Protect all routes

router.post('/', controller.create.bind(controller));
router.get('/', controller.list.bind(controller));
router.get('/:workspaceId/me', controller.getMe.bind(controller));
router.get('/:id', controller.getById.bind(controller));
router.put('/:id', requirePermission('workspace:update'), controller.update.bind(controller));
router.delete('/:id', requirePermission('workspace:delete'), controller.delete.bind(controller));

// Logo upload
router.post('/:id/logo', requirePermission('workspace:update'), upload.single('logo'), controller.uploadLogo.bind(controller));
// Logo download - redirect to public URL
router.get('/:id/logo', controller.getLogo.bind(controller));

// FIRST: Roles routes (must come BEFORE members routes to avoid route conflicts)
// Remove duplicate - keep only this one
router.use('/:id/roles', workspaceRolesRoutes);

// Members - come AFTER roles routes
// Invite members (specific routes before parameterized)
router.post('/:id/members/invite', requirePermission('members:create'), controller.inviteMember.bind(controller));
router.get('/:id/members/invitations', controller.getInvitations.bind(controller));
router.post('/:id/members/resend/:invitationId', requirePermission('members:create'), controller.resendInvitation.bind(controller));
router.delete('/:id/members/invitations/:invitationId', requirePermission('members:delete'), controller.cancelInvitation.bind(controller));
router.post('/:id/members/invitations/:invitationId/cancel', requirePermission('members:delete'), controller.cancelInvitation.bind(controller));

// Members list/details
router.get('/:id/members', controller.getMembers.bind(controller));
router.get('/:id/members/:memberId', controller.getMember.bind(controller));

// Member actions
router.put('/:id/members/:memberId', requirePermission('members:edit'), controller.updateMember.bind(controller));
router.delete('/:id/members/:memberId', requirePermission('members:delete'), controller.removeMember.bind(controller));

// Leave workspace
router.post('/:id/leave', controller.leave.bind(controller));

// My invitations (authenticated)
router.get('/invitations/me', controller.getMyInvitations.bind(controller));

export default router;
