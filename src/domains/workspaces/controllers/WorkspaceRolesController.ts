import { Request, Response } from 'express';
import { WorkspaceRequestRepository } from '../repositories/WorkspaceRequestRepository';
import { SubscriptionRequestRepository } from '@domains/subscription/repositories/SubscriptionRequestRepository';

export class WorkspaceRolesController {
    constructor(
        private workspaceRequestRepository: WorkspaceRequestRepository,
        private subscriptionRequestRepository?: SubscriptionRequestRepository
    ) { }

    private getUserId(req: Request): string {
        return (req as any).user?.userId || (req as any).user?.sub || (req as any).user?.id;
    }

    async list(req: Request, res: Response) {
        const userId = this.getUserId(req);
        const workspaceId = req.params.id;
        const { page, limit, search, types, minPermissions } = req.query;

        let typesArray: string[] | undefined;
        if (types) {
            if (Array.isArray(types)) {
                typesArray = types as string[];
            } else if (typeof types === 'string') {
                typesArray = types.split(',');
            }
        }

        const result = await this.workspaceRequestRepository.getRoles(workspaceId, userId, {
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined,
            search: search as string,
            types: typesArray,
            minPermissions: minPermissions ? parseInt(minPermissions as string) : undefined
        });

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async getById(req: Request, res: Response) {
        const userId = this.getUserId(req);
        const workspaceId = req.params.id;
        const roleId = req.params.roleId;

        const result = await this.workspaceRequestRepository.getRole(workspaceId, userId, roleId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async create(req: Request, res: Response) {
        const userId = this.getUserId(req);
        const workspaceId = req.params.id;

        if (this.subscriptionRequestRepository) {
            const rolesResult = await this.workspaceRequestRepository.getRoles(workspaceId, userId, {});
            const currentCount = rolesResult.data?.length || 0;
            await this.subscriptionRequestRepository.checkFeatureLimit(userId, 'customRoles', currentCount);
        }

        const result = await this.workspaceRequestRepository.createRole(workspaceId, userId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.status(201).json(result);
    }

    async update(req: Request, res: Response) {
        const userId = this.getUserId(req);
        const workspaceId = req.params.id;
        const roleId = req.params.roleId;
        const result = await this.workspaceRequestRepository.updateRole(workspaceId, userId, roleId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Role updated successfully' });
    }

    async delete(req: Request, res: Response) {
        const userId = this.getUserId(req);
        const workspaceId = req.params.id;
        const roleId = req.params.roleId;
        const result = await this.workspaceRequestRepository.deleteRole(workspaceId, userId, roleId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Role deleted successfully' });
    }

    async assign(req: Request, res: Response) {
        const userId = this.getUserId(req);
        const workspaceId = req.params.id;
        const memberId = req.params.memberId;

        let roleId = req.body.roleId || req.body.role;
        const accountPermissions = req.body.accountPermissions;

        if (roleId && !roleId.includes('-')) {
            const role = await this.workspaceRequestRepository.findRoleByName(roleId, workspaceId);
            if (role) {
                roleId = role.id;
            } else {
                res.status(400).json({ message: `Role '${roleId}' not found` });
                return;
            }
        }

        const result = await this.workspaceRequestRepository.assignRole(workspaceId, userId, memberId, { roleId, accountPermissions });

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Role assigned successfully' });
    }
}