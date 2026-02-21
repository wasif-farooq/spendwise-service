import { Request, Response } from 'express';
import { OrganizationRequestRepository } from '../repositories/OrganizationRequestRepository';

export class OrganizationRolesController {
    constructor(private organizationRequestRepository: OrganizationRequestRepository) { }

    async list(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const orgId = req.params.id;
        const { page, limit, search } = req.query;

        const result = await this.organizationRequestRepository.getRoles(orgId, userId, {
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined,
            search: search as string
        });

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async getById(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const orgId = req.params.id;
        const roleId = req.params.roleId;

        const result = await this.organizationRequestRepository.getRole(orgId, userId, roleId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async create(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const orgId = req.params.id;
        const result = await this.organizationRequestRepository.createRole(orgId, userId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.status(201).json(result);
    }

    async update(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const orgId = req.params.id;
        const roleId = req.params.roleId;
        const result = await this.organizationRequestRepository.updateRole(orgId, userId, roleId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Role updated successfully' });
    }

    async delete(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const orgId = req.params.id;
        const roleId = req.params.roleId;
        const result = await this.organizationRequestRepository.deleteRole(orgId, userId, roleId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Role deleted successfully' });
    }

    async assign(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const orgId = req.params.id;
        const memberId = req.params.memberId;
        const result = await this.organizationRequestRepository.assignRole(orgId, userId, memberId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Role assigned successfully' });
    }
}
