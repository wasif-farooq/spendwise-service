import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';
import { OrganizationRepository } from  '@domains/organizations/repositories/OrganizationRepository';
import { OrganizationMembersRepository } from  '@domains/organizations/repositories/OrganizationMembersRepository';
import { OrganizationRoleRepository } from  '@domains/organizations/repositories/OrganizationRoleRepository';
import { IUserRepository } from '@domains/auth/repositories/IUserRepository';
import { Organization } from  '@domains/organizations/models/Organization';
import { OrganizationMember } from  '@domains/organizations/models/OrganizationMember';
import { AppError } from '@shared/errors/AppError';
import { UpdateOrganizationDto, InviteMemberDto } from  '@domains/organizations/dto/organization.dto';
import { CreateRoleDto, UpdateRoleDto } from  '@domains/organizations/dto/role.dto';
import { OrganizationRole } from  '@domains/organizations/models/OrganizationRole';

export class OrganizationService {
    constructor(
        @Inject(TOKENS.OrganizationRepository) private organizationRepository: OrganizationRepository,
        @Inject(TOKENS.OrganizationMembersRepository) private organizationMembersRepository: OrganizationMembersRepository,
        @Inject(TOKENS.OrganizationRoleRepository) private organizationRoleRepository: OrganizationRoleRepository,
        @Inject('UserRepository') private userRepository: IUserRepository
    ) { }

    async update(orgId: string, userId: string, dto: UpdateOrganizationDto): Promise<Organization> {
        const member = await this.organizationMembersRepository.findByUserAndOrg(userId, orgId);
        if (!member) {
            throw new AppError('Not a member of this organization', 403);
        }

        const organization = await this.organizationRepository.findById(orgId);
        if (!organization) {
            throw new AppError('Organization not found', 404);
        }

        // Permission check
        const hasPermission = await this.checkPermission(orgId, userId, 'organization:update');
        if (!hasPermission) {
            throw new AppError('Insufficient permissions to update organization', 403);
        }

        if (dto.name) organization.changeName(dto.name);
        await this.organizationRepository.save(organization);
        return organization;
    }

    async delete(orgId: string, userId: string): Promise<void> {
        const organization = await this.organizationRepository.findById(orgId);
        if (!organization) {
            throw new AppError('Organization not found', 404);
        }

        if (organization.ownerId !== userId) {
            throw new AppError('Only owner can delete organization', 403);
        }

        await this.organizationRepository.delete(orgId);
    }

    async getUserOrganizations(userId: string): Promise<Organization[]> {
        const memberships = await this.organizationMembersRepository.findByUserId(userId);
        if (memberships.length === 0) return [];

        const orgIds = memberships.map(m => m.organizationId);
        return this.organizationRepository.findByIds(orgIds);
    }

    async getMembers(orgId: string, userId: string): Promise<any[]> {
        const member = await this.organizationMembersRepository.findByUserAndOrg(userId, orgId);
        if (!member) {
            throw new AppError('Not a member of this organization', 403);
        }

        return this.organizationMembersRepository.findAllWithDetails(orgId);
    }

    async inviteMember(orgId: string, userId: string, dto: InviteMemberDto): Promise<void> {
        const hasPermission = await this.checkPermission(orgId, userId, 'members:create');
        if (!hasPermission) {
            throw new AppError('Insufficient permissions to invite members', 403);
        }

        const userToInvite = await this.userRepository.findByEmail(dto.email);
        if (!userToInvite) {
            throw new AppError('User not found. Invite flow for non-existent users not implemented yet.', 400);
        }

        const existingMember = await this.organizationMembersRepository.findByUserAndOrg(userToInvite.id, orgId);
        if (existingMember) {
            throw new AppError('User is already a member', 409);
        }

        const role = await this.organizationRoleRepository.findByNameAndOrg(dto.roleName, orgId);
        if (!role) throw new AppError('Role not found', 404);

        const newMember = OrganizationMember.create({
            organizationId: orgId,
            userId: userToInvite.id,
            roleIds: [role.id]
        });

        await this.organizationMembersRepository.create(newMember);
    }

    async removeMember(orgId: string, userId: string, memberIdToRemove: string): Promise<void> {
        const hasPermission = await this.checkPermission(orgId, userId, 'members:delete');
        if (!hasPermission) {
            throw new AppError('Insufficient permissions to remove members', 403);
        }

        const memberToRemove = await this.organizationMembersRepository.findById(memberIdToRemove);
        if (!memberToRemove || memberToRemove.organizationId !== orgId) {
            throw new AppError('Member not found', 404);
        }

        await this.organizationMembersRepository.delete(memberIdToRemove);
    }

    async getRoles(orgId: string, userId: string, params: { page?: number; limit?: number; search?: string } = {}): Promise<{ roles: any[]; total: number }> {
        const member = await this.organizationMembersRepository.findByUserAndOrg(userId, orgId);
        if (!member) throw new AppError('Not a member of this organization', 403);

        const page = params.page || 1;
        const limit = params.limit || 10;
        const offset = (page - 1) * limit;

        const { roles, total } = await this.organizationRoleRepository.findPaginated(orgId, {
            limit,
            offset,
            search: params.search
        });

        return { roles, total };
    }
    async getRole(orgId: string, userId: string, roleId: string): Promise<OrganizationRole> {
        const member = await this.organizationMembersRepository.findByUserAndOrg(userId, orgId);
        if (!member) throw new AppError('Not a member of this organization', 403);

        const role = await this.organizationRoleRepository.findById(roleId);
        if (!role || role.organizationId !== orgId) throw new AppError('Role not found', 404);

        return role;
    }

    async createRole(orgId: string, userId: string, dto: CreateRoleDto): Promise<OrganizationRole> {
        const hasPermission = await this.checkPermission(orgId, userId, 'roles:create');
        if (!hasPermission) throw new AppError('Insufficient permissions to create roles', 403);

        const existing = await this.organizationRoleRepository.findByNameAndOrg(dto.name, orgId);
        if (existing) throw new AppError('Role name already exists in this organization', 400);

        const role = OrganizationRole.create({
            name: dto.name,
            description: dto.description,
            organizationId: orgId,
            permissions: dto.permissions
        });

        await this.organizationRoleRepository.create(role);
        return role;
    }

    async updateRole(orgId: string, userId: string, roleId: string, permissions: string[]): Promise<void> {
        const hasPermission = await this.checkPermission(orgId, userId, 'roles:edit');
        if (!hasPermission) throw new AppError('Insufficient permissions to manage roles', 403);

        const role = await this.organizationRoleRepository.findById(roleId);
        if (!role || role.organizationId !== orgId) throw new AppError('Role not found', 404);

        role.changePermissions(permissions);
        await this.organizationRoleRepository.save(role);
    }

    async assignRole(orgId: string, userId: string, memberId: string, roleId: string): Promise<void> {
        const hasPermission = await this.checkPermission(orgId, userId, 'members:edit');
        if (!hasPermission) throw new AppError('Insufficient permissions to assign roles', 403);

        const member = await this.organizationMembersRepository.findById(memberId);
        if (!member || member.organizationId !== orgId) throw new AppError('Member not found', 404);

        const role = await this.organizationRoleRepository.findById(roleId);
        if (!role || role.organizationId !== orgId) throw new AppError('Role not valid for this organization', 400);

        member.addRole(roleId);
        await this.organizationMembersRepository.save(member);
    }

    async deleteRole(orgId: string, userId: string, roleId: string): Promise<void> {
        const hasPermission = await this.checkPermission(orgId, userId, 'roles:delete');
        if (!hasPermission) throw new AppError('Insufficient permissions to delete roles', 403);

        const role = await this.organizationRoleRepository.findById(roleId);
        if (!role || role.organizationId !== orgId) throw new AppError('Role not found', 404);

        if (role.isSystem) throw new AppError('Cannot delete system role', 400);

        // Check if strictly assigned
        const assignedCount = await this.organizationMembersRepository.countByRole(roleId);
        if (assignedCount > 0) throw new AppError('Cannot delete role with assigned members', 400);

        await this.organizationRoleRepository.delete(roleId);
    }

    async checkPermission(orgId: string, userId: string, permission: string): Promise<boolean> {
        const organization = await this.organizationRepository.findById(orgId);
        if (!organization) return false;

        if (organization.ownerId === userId) return true;

        const member = await this.organizationMembersRepository.findByUserAndOrg(userId, orgId);
        if (!member) return false;

        if (member.roleIds.length === 0) return false;

        const roles = await this.organizationRoleRepository.findByIds(member.roleIds);
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
