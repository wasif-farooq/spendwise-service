import { Request, Response } from 'express';
import { WorkspaceRequestRepository } from '../repositories/WorkspaceRequestRepository';

export class WorkspaceController {
    constructor(private workspaceRequestRepository: WorkspaceRequestRepository) { }

    async create(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const result = await this.workspaceRequestRepository.create(userId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.status(201).json(result);
    }

    async update(req: Request, res: Response) {
        // userId from token (middleware)
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const result = await this.workspaceRequestRepository.update(workspaceId, userId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async delete(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const result = await this.workspaceRequestRepository.delete(workspaceId, userId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Workspace deleted successfully' });
    }

    async list(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const result = await this.workspaceRequestRepository.list(userId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async getMembers(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const { page, limit, search, roles, statuses, startDate, endDate } = req.query;

        // Handle roles - can be array or string
        let rolesArray: string[] | undefined;
        if (roles) {
            if (Array.isArray(roles)) {
                rolesArray = roles as string[];
            } else if (typeof roles === 'string') {
                rolesArray = roles.split(',');
            }
        }

        // Handle statuses - can be array or string
        let statusesArray: string[] | undefined;
        if (statuses) {
            if (Array.isArray(statuses)) {
                statusesArray = statuses as string[];
            } else if (typeof statuses === 'string') {
                statusesArray = statuses.split(',');
            }
        }

        const result = await this.workspaceRequestRepository.getMembers(workspaceId, userId, {
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined,
            search: search as string,
            roles: rolesArray,
            statuses: statusesArray,
            startDate: startDate as string,
            endDate: endDate as string
        });

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async inviteMember(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const result = await this.workspaceRequestRepository.inviteMember(workspaceId, userId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Member invited successfully' });
    }

    async removeMember(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const memberId = req.params.memberId;
        const result = await this.workspaceRequestRepository.removeMember(workspaceId, userId, memberId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Member removed successfully' });
    }
}
