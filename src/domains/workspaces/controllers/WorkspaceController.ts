import { Request, Response } from 'express';
import { WorkspaceRequestRepository } from '../repositories/WorkspaceRequestRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { RepositoryFactory } from '@factories/RepositoryFactory';

export class WorkspaceController {
    constructor(private workspaceRequestRepository: WorkspaceRequestRepository) { }

    async getMe(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.workspaceId;
        const result = await this.workspaceRequestRepository.getUserWorkspaceContext(workspaceId, userId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result.data || result);
    }

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
        // Handle both array and object responses
        res.json(result.data || result);
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
        // Handle both array and object responses
        res.json(result.data || result);
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

    async leave(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        
        const result = await this.workspaceRequestRepository.removeMember(workspaceId, userId, userId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'You have left the workspace successfully' });
    }

    async getById(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const result = await this.workspaceRequestRepository.getById(workspaceId, userId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async getMember(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const memberId = req.params.memberId;
        const result = await this.workspaceRequestRepository.getMember(workspaceId, userId, memberId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }

        // Ensure member is serialized if it's an entity
        const memberData = (result.data && typeof result.data.toJSON === 'function') 
            ? result.data.toJSON() 
            : result.data;

        res.json({ ...result, data: memberData });
    }

    async updateMember(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const memberId = req.params.memberId;
        const result = await this.workspaceRequestRepository.updateMember(workspaceId, userId, memberId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Member updated successfully' });
    }

    async uploadLogo(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;

        if (!req.file) {
            res.status(400).json({ message: 'No file uploaded' });
            return;
        }

        const file = req.file.buffer;
        const filename = req.file.originalname;
        const contentType = req.file.mimetype;

        const result = await this.workspaceRequestRepository.uploadLogo(workspaceId, userId, file, filename, contentType);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async getLogo(req: Request, res: Response) {
        const userId = (req as any).user?.userId || (req as any).user?.sub || (req as any).user?.id || '';
        const workspaceId = req.params.id;

        const result = await this.workspaceRequestRepository.getById(workspaceId, userId);

        if (result.error || !result.data) {
            res.status(404).json({ message: 'Workspace not found' });
            return;
        }

        const logoUrl = result.data.logo;
        if (!logoUrl) {
            res.status(404).json({ message: 'Logo not found' });
            return;
        }

        res.redirect(logoUrl);
    }

    // Role methods
    async listRoles(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const { page, limit, search, types, minPermissions } = req.query;

        const result = await this.workspaceRequestRepository.getRoles(workspaceId, userId, {
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined,
            search: search as string,
            types: types ? (types as string).split(',') : undefined,
            minPermissions: minPermissions ? parseInt(minPermissions as string) : undefined
        });

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result.data || result);
    }

    async getRole(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const roleId = req.params.roleId;

        const result = await this.workspaceRequestRepository.getRole(workspaceId, userId, roleId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result.data || result);
    }

    async createRole(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;

        const result = await this.workspaceRequestRepository.createRole(workspaceId, userId, req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.status(201).json(result.data || result);
    }

    async updateRole(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const roleId = req.params.roleId;
        const { permissions } = req.body;

        const result = await this.workspaceRequestRepository.updateRole(workspaceId, userId, roleId, permissions);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Role updated successfully' });
    }

    async deleteRole(req: Request, res: Response) {
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

    async assignRole(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const memberId = req.params.memberId;
        
        let roleId = req.body.roleId || req.body.role;
        
        if (roleId && !roleId.includes('-')) {
            const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
            const repoFactory = new RepositoryFactory(db);
            const roleRepo = repoFactory.createWorkspaceRoleRepository();
            const role = await roleRepo.findByNameAndWorkspace(roleId, workspaceId);
            if (role) {
                roleId = role.id;
            } else {
                res.status(400).json({ message: `Role '${roleId}' not found` });
                return;
            }
        }
        
        const result = await this.workspaceRequestRepository.assignRole(workspaceId, userId, memberId, roleId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Role assigned successfully' });
    }

    async duplicateRole(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const roleId = req.params.roleId;

        const result = await this.workspaceRequestRepository.duplicateRole(workspaceId, userId, roleId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.status(201).json(result.data || result);
    }

    async getInvitations(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const { page, limit, status } = req.query;

        const params = {
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined,
            status: status as string
        };

        const result = await this.workspaceRequestRepository.getInvitations(workspaceId, userId, params);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result.data || result);
    }

    async resendInvitation(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const invitationId = req.params.invitationId;

        const result = await this.workspaceRequestRepository.resendInvitation(workspaceId, userId, invitationId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Invitation resent successfully' });
    }

    async cancelInvitation(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
        const workspaceId = req.params.id;
        const invitationId = req.params.invitationId;

        const result = await this.workspaceRequestRepository.cancelInvitation(workspaceId, userId, invitationId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json({ message: 'Invitation cancelled successfully' });
    }

    async getInvitationByToken(req: Request, res: Response) {
        const { token } = req.query;

        if (!token) {
            res.status(400).json({ message: 'Token is required' });
            return;
        }

        const result = await this.workspaceRequestRepository.getInvitationByToken(token as string);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result.data || result);
    }

    async acceptInvitation(req: Request, res: Response) {
        const token = req.body?.token || req.query?.token as string;
        const firstName = req.body.firstName;
        const lastName = req.body.lastName;
        const password = req.body.password;

        if (!token) {
            res.status(400).json({ message: 'Token is required' });
            return;
        }

        const registrationData = firstName || lastName || password
            ? { firstName, lastName, password }
            : undefined;

        const result = await this.workspaceRequestRepository.acceptInvitation(token, registrationData);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result.data || result);
    }

    async getMyInvitations(req: Request, res: Response) {
        const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;

        const result = await this.workspaceRequestRepository.getMyInvitations(userId);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result.data || result);
    }

    async declineInvitation(req: Request, res: Response) {
        const token = req.body?.token || req.query?.token as string;

        if (!token) {
            res.status(400).json({ message: 'Token is required' });
            return;
        }

        const result = await this.workspaceRequestRepository.declineInvitation(token);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result.data || result);
    }
}
