import { Request, Response } from 'express';
import { WorkspaceRequestRepository } from '../repositories/WorkspaceRequestRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { RepositoryFactory } from '@factories/RepositoryFactory';

export class WorkspaceRolesController {
    constructor(private workspaceRequestRepository: WorkspaceRequestRepository) { }

    async list(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const { page, limit, search, types, minPermissions } = req.query;

        // Handle types - can be array from query string or string
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
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
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
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const result = await this.workspaceRequestRepository.createRole(workspaceId, userId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.status(201).json(result);
    }

    async update(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
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
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
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
        console.log('[assign] ====== START ======');
        console.log('[assign] req.params:', req.params);
        console.log('[assign] req.body:', req.body);
        
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const memberId = req.params.memberId;
        
        let roleId = req.body.roleId || req.body.role;
        const accountPermissions = req.body.accountPermissions;
        
        console.log('[assign] Extracted - roleId:', roleId, 'accountPermissions:', accountPermissions);
        
        if (roleId && !roleId.includes('-')) {
            console.log('[assign] Role is a name, looking up by name:', roleId);
            const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
            const repoFactory = new RepositoryFactory(db);
            const roleRepo = repoFactory.createWorkspaceRoleRepository();
            console.log('[assign] Calling findByNameAndWorkspace:', roleId, workspaceId);
            const role = await roleRepo.findByNameAndWorkspace(roleId, workspaceId);
            console.log('[assign] Found role:', role);
            if (role) {
                roleId = role.id;
                console.log('[assign] Set roleId to:', roleId);
            } else {
                res.status(400).json({ message: `Role '${roleId}' not found` });
                return;
            }
        } else {
            console.log('[assign] Role appears to be a UUID already:', roleId);
        }
        
        console.log('[assign] Final roleId to use:', roleId);
        console.log('[assign] Calling repository with:', { roleId, accountPermissions });
        const result = await this.workspaceRequestRepository.assignRole(workspaceId, userId, memberId, { roleId, accountPermissions });

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Role assigned successfully' });
    }
}
