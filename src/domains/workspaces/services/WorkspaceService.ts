import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';
import { WorkspaceRepository } from  '@domains/workspaces/repositories/WorkspaceRepository';
import { WorkspaceMembersRepository } from  '@domains/workspaces/repositories/WorkspaceMembersRepository';
import { WorkspaceRoleRepository } from  '@domains/workspaces/repositories/WorkspaceRoleRepository';
import { IUserRepository } from '@domains/auth/repositories/IUserRepository';
import { Workspace } from  '@domains/workspaces/models/Workspace';
import { WorkspaceMember } from  '@domains/workspaces/models/WorkspaceMember';
import { AppError } from '@shared/errors/AppError';
import { CreateWorkspaceDto, UpdateWorkspaceDto, InviteMemberDto } from  '@domains/workspaces/dto/workspace.dto';
import { CreateRoleDto, UpdateRoleDto } from  '@domains/workspaces/dto/role.dto';
import { WorkspaceRole } from  '@domains/workspaces/models/WorkspaceRole';

export class WorkspaceService {
    constructor(
        @Inject(TOKENS.WorkspaceRepository) private workspaceRepository: WorkspaceRepository,
        @Inject(TOKENS.WorkspaceMembersRepository) private workspaceMembersRepository: WorkspaceMembersRepository,
        @Inject(TOKENS.WorkspaceRoleRepository) private workspaceRoleRepository: WorkspaceRoleRepository,
        @Inject('UserRepository') private userRepository: IUserRepository
    ) { }

    async create(userId: string, dto: CreateWorkspaceDto): Promise<Workspace> {
        // Generate slug from name if not provided
        const slug = dto.slug || dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        
        // Check if slug already exists
        const existingWorkspaces = await this.workspaceRepository.findAll();
        const slugExists = existingWorkspaces.some(w => w.slug === slug);
        if (slugExists) {
            throw new AppError('Workspace with this name already exists', 400);
        }

        // Create workspace
        const workspace = Workspace.create({
            name: dto.name,
            slug,
            ownerId: userId
        });

        await this.workspaceRepository.save(workspace);

        // Create default "Admin" role for the workspace
        const adminRole = WorkspaceRole.create({
            name: 'Admin',
            description: 'Full access to all workspace features',
            workspaceId: workspace.id,
            permissions: ['*'],
            isSystem: true
        });
        await this.workspaceRoleRepository.create(adminRole);

        // Add owner as a member with Admin role
        const ownerMember = WorkspaceMember.create({
            workspaceId: workspace.id,
            userId: userId,
            roleIds: [adminRole.id]
        });
        await this.workspaceMembersRepository.create(ownerMember);

        return workspace;
    }

    async update(workspaceId: string, userId: string, dto: UpdateWorkspaceDto): Promise<Workspace> {
        const member = await this.workspaceMembersRepository.findByUserAndWorkspace(userId, workspaceId);
        if (!member) {
            throw new AppError('Not a member of this workspace', 403);
        }

        const workspace = await this.workspaceRepository.findById(workspaceId);
        if (!workspace) {
            throw new AppError('Workspace not found', 404);
        }

        // Permission check
        const hasPermission = await this.checkPermission(workspaceId, userId, 'workspace:update');
        if (!hasPermission) {
            throw new AppError('Insufficient permissions to update workspace', 403);
        }

        if (dto.name) workspace.changeName(dto.name);
        await this.workspaceRepository.save(workspace);
        return workspace;
    }

    async delete(workspaceId: string, userId: string): Promise<void> {
        const workspace = await this.workspaceRepository.findById(workspaceId);
        if (!workspace) {
            throw new AppError('Workspace not found', 404);
        }

        if (workspace.ownerId !== userId) {
            throw new AppError('Only owner can delete workspace', 403);
        }

        await this.workspaceRepository.delete(workspaceId);
    }

    async getUserWorkspaces(userId: string): Promise<Workspace[]> {
        const memberships = await this.workspaceMembersRepository.findByUserId(userId);
        if (memberships.length === 0) return [];

        const workspaceIds = memberships.map(m => m.workspaceId);
        return this.workspaceRepository.findByIds(workspaceIds);
    }

    async getMembers(workspaceId: string, userId: string): Promise<any[]> {
        const member = await this.workspaceMembersRepository.findByUserAndWorkspace(userId, workspaceId);
        if (!member) {
            throw new AppError('Not a member of this workspace', 403);
        }

        return this.workspaceMembersRepository.findAllWithDetails(workspaceId);
    }

    async inviteMember(workspaceId: string, userId: string, dto: InviteMemberDto): Promise<void> {
        const hasPermission = await this.checkPermission(workspaceId, userId, 'members:create');
        if (!hasPermission) {
            throw new AppError('Insufficient permissions to invite members', 403);
        }

        const userToInvite = await this.userRepository.findByEmail(dto.email);
        if (!userToInvite) {
            throw new AppError('User not found. Invite flow for non-existent users not implemented yet.', 400);
        }

        const existingMember = await this.workspaceMembersRepository.findByUserAndWorkspace(userToInvite.id, workspaceId);
        if (existingMember) {
            throw new AppError('User is already a member', 409);
        }

        const role = await this.workspaceRoleRepository.findByNameAndWorkspace(dto.roleName, workspaceId);
        if (!role) throw new AppError('Role not found', 404);

        const newMember = WorkspaceMember.create({
            workspaceId: workspaceId,
            userId: userToInvite.id,
            roleIds: [role.id]
        });

        await this.workspaceMembersRepository.create(newMember);
    }

    async removeMember(workspaceId: string, userId: string, memberIdToRemove: string): Promise<void> {
        const hasPermission = await this.checkPermission(workspaceId, userId, 'members:delete');
        if (!hasPermission) {
            throw new AppError('Insufficient permissions to remove members', 403);
        }

        const memberToRemove = await this.workspaceMembersRepository.findById(memberIdToRemove);
        if (!memberToRemove || memberToRemove.workspaceId !== workspaceId) {
            throw new AppError('Member not found', 404);
        }

        await this.workspaceMembersRepository.delete(memberIdToRemove);
    }

    async getRoles(workspaceId: string, userId: string, params: { page?: number; limit?: number; search?: string } = {}): Promise<{ roles: any[]; total: number }> {
        const member = await this.workspaceMembersRepository.findByUserAndWorkspace(userId, workspaceId);
        if (!member) throw new AppError('Not a member of this workspace', 403);

        const page = params.page || 1;
        const limit = params.limit || 10;
        const offset = (page - 1) * limit;

        const { roles, total } = await this.workspaceRoleRepository.findPaginated(workspaceId, {
            limit,
            offset,
            search: params.search
        });

        return { roles, total };
    }
    async getRole(workspaceId: string, userId: string, roleId: string): Promise<WorkspaceRole> {
        const member = await this.workspaceMembersRepository.findByUserAndWorkspace(userId, workspaceId);
        if (!member) throw new AppError('Not a member of this workspace', 403);

        const role = await this.workspaceRoleRepository.findById(roleId);
        if (!role || role.workspaceId !== workspaceId) throw new AppError('Role not found', 404);

        return role;
    }

    async createRole(workspaceId: string, userId: string, dto: CreateRoleDto): Promise<WorkspaceRole> {
        const hasPermission = await this.checkPermission(workspaceId, userId, 'roles:create');
        if (!hasPermission) throw new AppError('Insufficient permissions to create roles', 403);

        const existing = await this.workspaceRoleRepository.findByNameAndWorkspace(dto.name, workspaceId);
        if (existing) throw new AppError('Role name already exists in this workspace', 400);

        const role = WorkspaceRole.create({
            name: dto.name,
            description: dto.description,
            workspaceId: workspaceId,
            permissions: dto.permissions
        });

        await this.workspaceRoleRepository.create(role);
        return role;
    }

    async updateRole(workspaceId: string, userId: string, roleId: string, permissions: string[]): Promise<void> {
        const hasPermission = await this.checkPermission(workspaceId, userId, 'roles:edit');
        if (!hasPermission) throw new AppError('Insufficient permissions to manage roles', 403);

        const role = await this.workspaceRoleRepository.findById(roleId);
        if (!role || role.workspaceId !== workspaceId) throw new AppError('Role not found', 404);

        role.changePermissions(permissions);
        await this.workspaceRoleRepository.save(role);
    }

    async assignRole(workspaceId: string, userId: string, memberId: string, roleId: string): Promise<void> {
        const hasPermission = await this.checkPermission(workspaceId, userId, 'members:edit');
        if (!hasPermission) throw new AppError('Insufficient permissions to assign roles', 403);

        const member = await this.workspaceMembersRepository.findById(memberId);
        if (!member || member.workspaceId !== workspaceId) throw new AppError('Member not found', 404);

        const role = await this.workspaceRoleRepository.findById(roleId);
        if (!role || role.workspaceId !== workspaceId) throw new AppError('Role not valid for this workspace', 400);

        member.addRole(roleId);
        await this.workspaceMembersRepository.save(member);
    }

    async deleteRole(workspaceId: string, userId: string, roleId: string): Promise<void> {
        const hasPermission = await this.checkPermission(workspaceId, userId, 'roles:delete');
        if (!hasPermission) throw new AppError('Insufficient permissions to delete roles', 403);

        const role = await this.workspaceRoleRepository.findById(roleId);
        if (!role || role.workspaceId !== workspaceId) throw new AppError('Role not found', 404);

        if (role.isSystem) throw new AppError('Cannot delete system role', 400);

        // Check if strictly assigned
        const assignedCount = await this.workspaceMembersRepository.countByRole(roleId);
        if (assignedCount > 0) throw new AppError('Cannot delete role with assigned members', 400);

        await this.workspaceRoleRepository.delete(roleId);
    }

    async checkPermission(workspaceId: string, userId: string, permission: string): Promise<boolean> {
        const workspace = await this.workspaceRepository.findById(workspaceId);
        if (!workspace) return false;

        if (workspace.ownerId === userId) return true;

        const member = await this.workspaceMembersRepository.findByUserAndWorkspace(userId, workspaceId);
        if (!member) return false;

        if (member.roleIds.length === 0) return false;

        const roles = await this.workspaceRoleRepository.findByIds(member.roleIds);
        return roles.some(role => {
            // 1. Full Wildcard
            if (role.permissions.includes('*')) return true;

            // 2. Exact Match
            if (role.permissions.includes(permission)) return true;

            // 3. Resource Wildcard (e.g. 'members:*' allows 'members:create')
            const parts = permission.split(':');
            if (parts.length > 1) {
                const resourceWildcard = `${parts[0]}:*`;
                if (role.permissions.includes(resourceWildcard)) return true;
            }

            return false;
        });
    }
}
