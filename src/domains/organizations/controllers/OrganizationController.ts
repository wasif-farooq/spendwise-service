import { Request, Response } from 'express';
import { OrganizationRequestRepository } from '../repositories/OrganizationRequestRepository';

export class OrganizationController {
    constructor(private organizationRequestRepository: OrganizationRequestRepository) { }

    async update(req: Request, res: Response) {
        // userId from token (middleware)
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const orgId = req.params.id;
        const result = await this.organizationRequestRepository.update(orgId, userId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async delete(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const orgId = req.params.id;
        const result = await this.organizationRequestRepository.delete(orgId, userId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Organization deleted successfully' });
    }

    async list(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const result = await this.organizationRequestRepository.list(userId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async getMembers(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const orgId = req.params.id;
        const result = await this.organizationRequestRepository.getMembers(orgId, userId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async inviteMember(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const orgId = req.params.id;
        const result = await this.organizationRequestRepository.inviteMember(orgId, userId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Member invited successfully' });
    }

    async removeMember(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const orgId = req.params.id;
        const memberId = req.params.memberId;
        const result = await this.organizationRequestRepository.removeMember(orgId, userId, memberId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Member removed successfully' });
    }
}
