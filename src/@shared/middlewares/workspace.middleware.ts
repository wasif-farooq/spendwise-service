import { Request, Response, NextFunction } from 'express';
import { WorkspaceMembersRepository } from '@domains/workspaces/repositories/WorkspaceMembersRepository';
import { WorkspaceRoleRepository } from '@domains/workspaces/repositories/WorkspaceRoleRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { AppError } from '@shared/errors/AppError';

// Initialize repos (singleton pattern)
let membersRepo: WorkspaceMembersRepository | null = null;
let roleRepo: WorkspaceRoleRepository | null = null;

const getMembersRepo = () => {
    if (!membersRepo) {
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        membersRepo = new WorkspaceMembersRepository(db);
    }
    return membersRepo;
};

const getRoleRepo = () => {
    if (!roleRepo) {
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        roleRepo = new WorkspaceRoleRepository(db);
    }
    return roleRepo;
};

export const requirePermission = (permission: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const workspaceId = req.params.workspaceId || req.params.orgId;
            const userId = (req as any).user?.userId || (req as any).user?.id;

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            if (!userId) {
                throw new AppError('Unauthorized', 401);
            }

            // Get member
            const memberRepo = getMembersRepo();
            const member = await memberRepo.findByUserAndWorkspace(userId, workspaceId);

            if (!member) {
                throw new AppError('You are not a member of this workspace', 403);
            }

            // Get role permissions
            if (!member.roleIds || member.roleIds.length === 0) {
                throw new AppError('You do not have permission to perform this action', 403);
            }

            const roleRepo = getRoleRepo();
            const role = await roleRepo.findById(member.roleIds[0]);

            if (!role) {
                throw new AppError('Role not found', 403);
            }

            const permissions = role.permissions || [];
            
            // Check permission (wildcard * allows everything)
            if (!permissions.includes(permission) && !permissions.includes('*')) {
                throw new AppError(`You do not have permission: ${permission}`, 403);
            }

            // Attach member to request for later use
            (req as any).workspaceMember = member;
            
            next();
        } catch (error) {
            next(error);
        }
    };
};

export const requireMembership = () => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const workspaceId = req.params.workspaceId || req.params.orgId;
            const userId = (req as any).user?.userId || (req as any).user?.id;

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            if (!userId) {
                throw new AppError('Unauthorized', 401);
            }

            const memberRepo = getMembersRepo();
            const member = await memberRepo.findByUserAndWorkspace(userId, workspaceId);

            if (!member) {
                throw new AppError('You are not a member of this workspace', 403);
            }

            (req as any).workspaceMember = member;
            next();
        } catch (error) {
            next(error);
        }
    };
};
