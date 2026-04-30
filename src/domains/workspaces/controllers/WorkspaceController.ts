import { Request, Response } from 'express';
import { WorkspaceRequestRepository } from '../repositories/WorkspaceRequestRepository';
import { SubscriptionRequestRepository } from '@domains/subscription/repositories/SubscriptionRequestRepository';
import { AuthRequestRepository } from '@domains/auth/repositories/AuthRequestRepository';

export class WorkspaceController {
    constructor(
        private workspaceRequestRepository: WorkspaceRequestRepository,
        private subscriptionRequestRepository?: SubscriptionRequestRepository,
        private authRequestRepository?: AuthRequestRepository
    ) { }

    private getUserId(req: Request): string {
        return (req as any).user?.userId || (req as any).user?.sub || (req as any).user?.id;
    }

    async getMe(req: Request, res: Response) {
        const userId = this.getUserId(req);
        const workspaceId = req.params.workspaceId;
        const result = await this.workspaceRequestRepository.getUserWorkspaceContext(workspaceId, userId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result.data || result);
    }

    async create(req: Request, res: Response) {
        const userId = this.getUserId(req);

        if (this.subscriptionRequestRepository) {
            const workspaceCountResult = await this.workspaceRequestRepository.countByOwnerId(userId);
            const currentCount = workspaceCountResult.data?.count || 0;
            await this.subscriptionRequestRepository.checkFeatureLimit(userId, 'workspaces', currentCount);
        }

        const result = await this.workspaceRequestRepository.create(userId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.status(201).json(result);
    }

    async update(req: Request, res: Response) {
        const userId = this.getUserId(req);
        const workspaceId = req.params.workspaceId;

        const result = await this.workspaceRequestRepository.update(workspaceId, userId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async delete(req: Request, res: Response) {
        const userId = this.getUserId(req);
        const workspaceId = req.params.workspaceId;

        const result = await this.workspaceRequestRepository.delete(workspaceId, userId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.status(204).send();
    }

    async getAll(req: Request, res: Response) {
        const userId = this.getUserId(req);

        const result = await this.workspaceRequestRepository.getAll(userId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async getById(req: Request, res: Response) {
        const userId = this.getUserId(req);
        const workspaceId = req.params.workspaceId;

        const result = await this.workspaceRequestRepository.getById(workspaceId, userId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async inviteMember(req: Request, res: Response) {
        const userId = this.getUserId(req);
        const workspaceId = req.params.workspaceId;

        if (this.subscriptionRequestRepository) {
            const membersResult = await this.workspaceRequestRepository.getMembers(workspaceId, userId, {});
            const currentCount = membersResult.data?.length || 0;

            const workspaceResult = await this.workspaceRequestRepository.getById(workspaceId, userId);
            const ownerId = workspaceResult.data?.ownerId || userId;

            await this.subscriptionRequestRepository.checkFeatureLimit(ownerId, 'members', currentCount);

            const invitationsResult = await this.workspaceRequestRepository.getInvitations(workspaceId, userId, { status: 'Pending' });
            const pendingInvitations = invitationsResult.data?.length || 0;
            await this.subscriptionRequestRepository.checkFeatureLimit(ownerId, 'invitations', pendingInvitations);
        }

        const result = await this.workspaceRequestRepository.inviteMember(workspaceId, userId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.status(201).json(result);
    }

    async removeMember(req: Request, res: Response) {
        const userId = this.getUserId(req);
        const workspaceId = req.params.workspaceId;
        const { memberId } = req.params;

        const result = await this.workspaceRequestRepository.removeMember(workspaceId, userId, memberId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async updateMemberRole(req: Request, res: Response) {
        const userId = this.getUserId(req);
        const workspaceId = req.params.workspaceId;
        const { memberId } = req.params;

        const result = await this.workspaceRequestRepository.updateMemberRole(workspaceId, userId, memberId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async getMembers(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;
        const userId = this.getUserId(req);

        const result = await this.workspaceRequestRepository.getMembers(workspaceId, userId, {});

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async getInvitations(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;
        const userId = this.getUserId(req);

        const result = await this.workspaceRequestRepository.getInvitations(workspaceId, userId, {});

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async cancelInvitation(req: Request, res: Response) {
        const userId = this.getUserId(req);
        const workspaceId = req.params.workspaceId;
        const { invitationId } = req.params;

        const result = await this.workspaceRequestRepository.cancelInvitation(workspaceId, userId, invitationId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async resendInvitation(req: Request, res: Response) {
        const userId = this.getUserId(req);
        const workspaceId = req.params.workspaceId;
        const { invitationId } = req.params;

        const result = await this.workspaceRequestRepository.resendInvitation(workspaceId, userId, invitationId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async getMember(req: Request, res: Response) {
        const workspaceId = req.params.id;
        const { memberId } = req.params;
        const userId = this.getUserId(req);

        const result = await this.workspaceRequestRepository.getMemberById(workspaceId, userId, memberId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async updateMember(req: Request, res: Response) {
        const workspaceId = req.params.id;
        const { memberId } = req.params;
        const userId = this.getUserId(req);

        const result = await this.workspaceRequestRepository.updateMemberRole(workspaceId, userId, memberId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async leave(req: Request, res: Response) {
        const userId = this.getUserId(req);
        const workspaceId = req.params.id;

        const result = await this.workspaceRequestRepository.leaveWorkspace(workspaceId, userId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async getMyInvitations(req: Request, res: Response) {
        const userId = this.getUserId(req);

        const result = await this.workspaceRequestRepository.getMyInvitations(userId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async getInvitationByToken(req: Request, res: Response) {
        const { token } = req.query;

        const result = await this.workspaceRequestRepository.getInvitationByToken(token as string);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async acceptInvitation(req: Request, res: Response) {
        const { token, registrationData } = req.body;

        const result = await this.workspaceRequestRepository.acceptInvitation(token, registrationData);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async declineInvitation(req: Request, res: Response) {
        const { token } = req.body;

        const result = await this.workspaceRequestRepository.declineInvitation(token);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }
}