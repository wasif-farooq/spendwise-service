import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';
import { WorkspaceRepository } from  '@domains/workspaces/repositories/WorkspaceRepository';
import { WorkspaceMembersRepository } from  '@domains/workspaces/repositories/WorkspaceMembersRepository';
import { WorkspaceRoleRepository } from  '@domains/workspaces/repositories/WorkspaceRoleRepository';
import { WorkspaceInvitationsRepository } from  '@domains/workspaces/repositories/WorkspaceInvitationsRepository';
import { IUserRepository } from '@domains/auth/repositories/IUserRepository';
import { AuthService } from '@domains/auth/services/AuthService';
import { Workspace } from  '@domains/workspaces/models/Workspace';
import { WorkspaceMember } from  '@domains/workspaces/models/WorkspaceMember';
import { WorkspaceInvitation } from  '@domains/workspaces/models/WorkspaceInvitation';
import { AppError } from '@shared/errors/AppError';
import { CreateWorkspaceDto, UpdateWorkspaceDto, InviteMemberDto, UpdateMemberDto, WorkspaceSettingsDto } from  '@domains/workspaces/dto/workspace.dto';
import { CreateRoleDto, UpdateRoleDto } from  '@domains/workspaces/dto/role.dto';
import { WorkspaceRole } from  '@domains/workspaces/models/WorkspaceRole';
import { PermissionCache } from '@shared/permissionCache';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { AccountRepository } from '@domains/accounts/repositories/AccountRepository';
import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { CategoryRepository } from '@domains/categories/repositories/CategoryRepository';
import { CategoryService } from '@domains/categories/services/CategoryService';
import { StorageService } from '@domains/storage/services/StorageService';
import { v4 as uuidv4 } from 'uuid';

export class WorkspaceService {
    constructor(
        @Inject(TOKENS.WorkspaceRepository) private workspaceRepository: WorkspaceRepository,
        @Inject(TOKENS.WorkspaceMembersRepository) private workspaceMembersRepository: WorkspaceMembersRepository,
        @Inject(TOKENS.WorkspaceRoleRepository) private workspaceRoleRepository: WorkspaceRoleRepository,
        @Inject(TOKENS.WorkspaceInvitationsRepository) private workspaceInvitationsRepository: WorkspaceInvitationsRepository,
        @Inject('UserRepository') private userRepository: IUserRepository,
        @Inject(TOKENS.AuthService) private authService: AuthService,
        @Inject(TOKENS.Database) private db: DatabaseFacade,
        @Inject(TOKENS.AccountRepository) private accountRepository: AccountRepository,
        @Inject(TOKENS.TransactionRepository) private transactionRepository: TransactionRepository,
        @Inject(TOKENS.CategoryRepository) private categoryRepository: CategoryRepository,
        @Inject(TOKENS.CategoryService) private categoryService: CategoryService,
        @Inject(TOKENS.StorageService) private storageService: StorageService
    ) { }

    async create(userId: string, dto: CreateWorkspaceDto, options?: { db?: DatabaseFacade }): Promise<Workspace> {
        const db = options?.db;

        // Generate slug from name if not provided
        const slug = dto.slug || dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        
        // Check if slug already exists
        const existingWorkspaces = await this.workspaceRepository.findAll(db ? { db } : undefined);
        const slugExists = existingWorkspaces.some(w => w.slug === slug);
        if (slugExists) {
            throw new AppError('Workspace with this name already exists', 400);
        }

        // Create workspace
        const workspace = Workspace.create({
            name: dto.name,
            slug,
            ownerId: userId,
            description: dto.description,
            website: dto.website,
            industry: dto.industry,
            size: dto.size
        });

        await this.workspaceRepository.save(workspace, db ? { db } : undefined);

        // Create default "Owner" role for the workspace with all permissions
        const ownerRole = WorkspaceRole.create({
            name: 'Owner',
            description: 'Full access to all workspace features. This role cannot be deleted or edited.',
            workspaceId: workspace.id,
            permissions: ['*'], // All permissions
            isSystem: true // System roles cannot be deleted or edited
        });
        await this.workspaceRoleRepository.create(ownerRole, db ? { db } : undefined);

        // Add owner as a member with Owner role and mark as default (workspace creator)
        const ownerMember = WorkspaceMember.create({
            workspaceId: workspace.id,
            userId: userId,
            roleIds: [ownerRole.id],
            isDefault: true
        });
        await this.workspaceMembersRepository.create(ownerMember, db ? { db } : undefined);

        // Create default categories for the workspace
        await this.createDefaultCategories(workspace.id, db);

        return workspace;
    }

    private async createDefaultCategories(workspaceId: string, db?: DatabaseFacade): Promise<void> {
        const expenseCategories = [
            { name: 'Food & Dining', type: 'expense' as const, icon: '🍽️', color: '#FF6B6B' },
            { name: 'Transportation', type: 'expense' as const, icon: '🚗', color: '#4ECDC4' },
            { name: 'Shopping', type: 'expense' as const, icon: '🛍️', color: '#45B7D1' },
            { name: 'Entertainment', type: 'expense' as const, icon: '🎬', color: '#96CEB4' },
            { name: 'Bills & Utilities', type: 'expense' as const, icon: '💡', color: '#FFEAA7' },
            { name: 'Health & Fitness', type: 'expense' as const, icon: '💪', color: '#DDA0DD' },
            { name: 'Travel', type: 'expense' as const, icon: '✈️', color: '#98D8C8' },
            { name: 'Education', type: 'expense' as const, icon: '📚', color: '#F7DC6F' },
            { name: 'Personal Care', type: 'expense' as const, icon: '💅', color: '#BB8FCE' },
            { name: 'Home & Garden', type: 'expense' as const, icon: '🏠', color: '#85C1E9' },
        ];

        const incomeCategories = [
            { name: 'Salary', type: 'income' as const, icon: '💰', color: '#27AE60' },
            { name: 'Freelance', type: 'income' as const, icon: '💻', color: '#2980B9' },
            { name: 'Investments', type: 'income' as const, icon: '📈', color: '#8E44AD' },
            { name: 'Business', type: 'income' as const, icon: '🏢', color: '#16A085' },
            { name: 'Gifts', type: 'income' as const, icon: '🎁', color: '#E74C3C' },
            { name: 'Other Income', type: 'income' as const, icon: '💵', color: '#F39C12' },
        ];

        const allCategories = [...expenseCategories, ...incomeCategories];
        await this.categoryService.bulkCreate(allCategories, workspaceId, db ? { db } : undefined);
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

        workspace.updateDetails({
            name: dto.name,
            description: dto.description,
            logo: dto.logo,
            website: dto.website,
            industry: dto.industry,
            size: dto.size
        });
        await this.workspaceRepository.save(workspace);
        return workspace;
    }

    async getById(workspaceId: string, userId: string): Promise<Workspace> {
        const member = await this.workspaceMembersRepository.findByUserAndWorkspace(userId, workspaceId);
        if (!member) {
            throw new AppError('Not a member of this workspace', 403);
        }

        const workspace = await this.workspaceRepository.findById(workspaceId);
        if (!workspace) {
            throw new AppError('Workspace not found', 404);
        }

        return workspace;
    }

    async getMembers(workspaceId: string, userId: string, params: { 
        page?: number; 
        limit?: number; 
        search?: string;
        roles?: string[];
        statuses?: string[];
        startDate?: string;
        endDate?: string;
    } = {}): Promise<{ members: any[]; total: number }> {
        const member = await this.workspaceMembersRepository.findByUserAndWorkspace(userId, workspaceId);
        if (!member) {
            throw new AppError('Not a member of this workspace', 403);
        }

        const page = params.page || 1;
        const limit = params.limit || 10;
        const offset = (page - 1) * limit;

        return this.workspaceMembersRepository.findAllWithDetails(workspaceId, {
            limit,
            offset,
            search: params.search,
            roles: params.roles,
            statuses: params.statuses,
            startDate: params.startDate,
            endDate: params.endDate
        });
    }

    async getMember(workspaceId: string, userId: string, memberId: string): Promise<any> {
        const member = await this.workspaceMembersRepository.findByUserAndWorkspace(userId, workspaceId);
        if (!member) {
            throw new AppError('Not a member of this workspace', 403);
        }

        const targetMember = await this.workspaceMembersRepository.findById(memberId);
        if (!targetMember || targetMember.workspaceId !== workspaceId) {
            throw new AppError('Member not found', 404);
        }

        const { members } = await this.workspaceMembersRepository.findAllWithDetails(workspaceId, {
            limit: 1,
            offset: 0,
            memberId
        });

        const memberData = members[0];
        
        // Fetch account permissions for this member
        const accountPermissions = await this.workspaceMembersRepository.getAccountPermissions(memberId);
        
        // Add accountPermissions to the response if they exist
        if (accountPermissions && Object.keys(accountPermissions).length > 0) {
            memberData.accountPermissions = accountPermissions;
        }

        return memberData;
    }

    async updateMember(workspaceId: string, userId: string, memberId: string, dto: UpdateMemberDto): Promise<void> {
        const member = await this.workspaceMembersRepository.findByUserAndWorkspace(userId, workspaceId);
        if (!member) {
            throw new AppError('Not a member of this workspace', 403);
        }

        const hasPermission = await this.checkPermission(workspaceId, userId, 'members:edit');
        if (!hasPermission) {
            throw new AppError('Insufficient permissions to update member', 403);
        }

        const targetMember = await this.workspaceMembersRepository.findById(memberId);
        if (!targetMember || targetMember.workspaceId !== workspaceId) {
            throw new AppError('Member not found', 404);
        }

        if (targetMember.isDefault) {
            throw new AppError('Cannot modify workspace creator', 403);
        }

        // Update role if provided (accept both 'role' and 'roleName' from frontend)
        const roleName = dto.roleName || dto.role;
        if (roleName) {
            const role = await this.workspaceRoleRepository.findByNameAndWorkspace(roleName, workspaceId);
            if (!role) {
                throw new AppError('Role not found', 404);
            }
            targetMember.setRoles([role.id]);
        }

        // Update status if provided
        if (dto.status) {
            targetMember.updateStatus(dto.status);
        }

        // Update account permissions if provided
        if (dto.accountPermissions) {
            if (Object.keys(dto.accountPermissions).length > 0) {
                // Save permissions when object has content
                await this.workspaceMembersRepository.saveAccountPermissions(memberId, dto.accountPermissions);
            } else {
                // Clear permissions when empty object is sent
                await this.workspaceMembersRepository.deleteAccountPermissions(memberId);
            }
        }

        await this.workspaceMembersRepository.save(targetMember);
    }

    async delete(workspaceId: string, userId: string): Promise<void> {
        const workspace = await this.workspaceRepository.findById(workspaceId);
        if (!workspace) {
            throw new AppError('Workspace not found', 404);
        }

        if (workspace.ownerId !== userId) {
            throw new AppError('Only owner can delete workspace', 403);
        }

        // Delete workspace - let CASCADE handle related records
        await this.workspaceRepository.delete(workspaceId);
    }

    async getUserWorkspaces(userId: string): Promise<Workspace[]> {
        const memberships = await this.workspaceMembersRepository.findByUserId(userId);
        if (memberships.length === 0) return [];

        const workspaceIds = memberships.map(m => m.workspaceId);
        return this.workspaceRepository.findByIds(workspaceIds);
    }

    async inviteMember(workspaceId: string, userId: string, dto: InviteMemberDto): Promise<void> {
        const hasPermission = await this.checkPermission(workspaceId, userId, 'members:create');
        if (!hasPermission) {
            throw new AppError('Insufficient permissions to invite members', 403);
        }

        const existingUser = await this.userRepository.findByEmail(dto.email);
        if (existingUser) {
            const existingMember = await this.workspaceMembersRepository.findByUserAndWorkspace(
                existingUser.id,
                workspaceId
            );
            if (existingMember) {
                throw new AppError('User is already a member', 409);
            }
        }

        const existingInvitation = await this.workspaceInvitationsRepository.findByWorkspaceAndEmail(
            workspaceId,
            dto.email,
            'pending'
        );
        if (existingInvitation) {
            throw new AppError('Invitation already sent to this email', 409);
        }

        const role = await this.workspaceRoleRepository.findByNameAndWorkspace(dto.roleName, workspaceId);
        if (!role) throw new AppError('Role not found', 404);

        const token = this.generateInviteToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const invitation = WorkspaceInvitation.create({
            workspaceId,
            email: dto.email,
            roleIds: [role.id],
            accountPermissions: dto.accountPermissions,
            token,
            expiresAt,
            invitedBy: userId
        });

        const createdInvitation = await this.workspaceInvitationsRepository.create(invitation);

        await this.sendInvitationEmail(createdInvitation, workspaceId);
    }

    private generateInviteToken(): string {
        return uuidv4() + '-' + Date.now();
    }

    private async sendInvitationEmail(invitation: WorkspaceInvitation, workspaceId: string): Promise<void> {
        const workspace = await this.workspaceRepository.findById(workspaceId);
        if (!workspace) return;

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const acceptUrl = `${frontendUrl}/invitations/accept?token=${invitation.token}`;

        console.log(`
[Email] Invitation to join workspace "${workspace.name}"
To: ${invitation.email}
Click to accept: ${acceptUrl}
Expires in 7 days.
        `);
    }

    async resendInvitation(workspaceId: string, userId: string, invitationId: string): Promise<void> {
        const hasPermission = await this.checkPermission(workspaceId, userId, 'members:create');
        if (!hasPermission) {
            throw new AppError('Insufficient permissions to resend invitations', 403);
        }

        const invitation = await this.workspaceInvitationsRepository.findById(invitationId);
        if (!invitation || invitation.workspaceId !== workspaceId) {
            throw new AppError('Invitation not found', 404);
        }

        if (invitation.status !== 'pending') {
            throw new AppError('Invitation already accepted or expired', 400);
        }

        if (invitation.isExpired()) {
            invitation.markAsExpired();
            await this.workspaceInvitationsRepository.updateInvitation(invitation);
            throw new AppError('Invitation has expired. Please create a new invitation.', 400);
        }

        const newToken = this.generateInviteToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        invitation.regenerateToken(newToken, expiresAt);
        await this.workspaceInvitationsRepository.updateInvitation(invitation);

        await this.sendInvitationEmail(invitation, workspaceId);
    }

    async cancelInvitation(workspaceId: string, userId: string, invitationId: string): Promise<void> {
        const hasPermission = await this.checkPermission(workspaceId, userId, 'members:delete');
        if (!hasPermission) {
            throw new AppError('Insufficient permissions to cancel invitations', 403);
        }

        const invitation = await this.workspaceInvitationsRepository.findById(invitationId);
        if (!invitation || invitation.workspaceId !== workspaceId) {
            throw new AppError('Invitation not found', 404);
        }

        invitation.markAsCancelled();
        await this.workspaceInvitationsRepository.updateInvitation(invitation);
    }

    async getInvitations(workspaceId: string, userId: string, params: {
        page?: number;
        limit?: number;
        status?: string;
    } = {}): Promise<{ invitations: any[]; total: number }> {
        const hasPermission = await this.checkPermission(workspaceId, userId, 'members:read');
        if (!hasPermission) {
            throw new AppError('Insufficient permissions to view invitations', 403);
        }

        const page = params.page || 1;
        const limit = params.limit || 10;
        const offset = (page - 1) * limit;

        return this.workspaceInvitationsRepository.findByWorkspaceId(workspaceId, {
            limit,
            offset,
            status: params.status
        });
    }

    async getInvitationByToken(token: string): Promise<{
        id: string;
        email: string;
        roleName: string;
        roleNames?: string[];
        workspaceId: string;
        workspaceName: string;
        invitedByName: string;
        status: string;
        expiresAt: string;
        capabilities?: string[];
    }> {
        const invitation = await this.workspaceInvitationsRepository.findByToken(token);
        
        if (!invitation) {
            throw new AppError('Invalid invitation', 404);
        }

        if (invitation.status === 'accepted') {
            return {
                id: invitation.id,
                email: invitation.email,
                roleName: invitation.roleIds?.[0] || 'Member',
                workspaceId: invitation.workspaceId,
                workspaceName: '', // Will be populated below
                invitedByName: '', // Will be populated below
                status: invitation.status,
                expiresAt: invitation.expiresAt.toISOString()
            };
        }

        if (invitation.status === 'declined') {
            return {
                id: invitation.id,
                email: invitation.email,
                roleName: invitation.roleIds?.[0] || 'Member',
                workspaceId: invitation.workspaceId,
                workspaceName: '',
                invitedByName: '',
                status: invitation.status,
                expiresAt: invitation.expiresAt.toISOString()
            };
        }

        if (invitation.status === 'expired' || invitation.isExpired()) {
            invitation.markAsExpired();
            await this.workspaceInvitationsRepository.updateInvitation(invitation);
            return {
                id: invitation.id,
                email: invitation.email,
                roleName: invitation.roleIds?.[0] || 'Member',
                workspaceId: invitation.workspaceId,
                workspaceName: '',
                invitedByName: '',
                status: 'expired',
                expiresAt: invitation.expiresAt.toISOString()
            };
        }

        // Get workspace details
        const workspace = await this.workspaceRepository.findById(invitation.workspaceId);
        
        // Get inviter details
        const inviter = await this.userRepository.findById(invitation.invitedBy);

        // Get role details
        const roles = await this.workspaceRoleRepository.findByIds(invitation.roleIds || []);
        const roleNames = roles.map(r => r.name);
        const capabilities = roles.flatMap(r => r.permissions || []);

        return {
            id: invitation.id,
            email: invitation.email,
            roleName: roleNames[0] || 'Member',
            roleNames,
            workspaceId: invitation.workspaceId,
            workspaceName: workspace?.name || '',
            invitedByName: inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : '',
            status: invitation.status,
            expiresAt: invitation.expiresAt.toISOString(),
            capabilities: [...new Set(capabilities)] // Unique capabilities
        };
    }

    async acceptInvitation(
        token: string,
        registrationData?: { firstName: string; lastName: string; password: string }
    ): Promise<{ success: boolean; message: string }> {
        const invitation = await this.workspaceInvitationsRepository.findByToken(token);
        if (!invitation) {
            throw new AppError('Invalid invitation', 400);
        }

        if (invitation.status === 'accepted') {
            throw new AppError('Invitation already accepted', 400);
        }

        if (invitation.status === 'expired' || invitation.isExpired()) {
            invitation.markAsExpired();
            await this.workspaceInvitationsRepository.updateInvitation(invitation);
            throw new AppError('Invitation expired', 400);
        }

        let userId: string;
        const existingUser = await this.userRepository.findByEmail(invitation.email);

        if (existingUser) {
            userId = existingUser.id;

            const alreadyMember = await this.workspaceMembersRepository.findByUserAndWorkspace(userId, invitation.workspaceId);
            if (alreadyMember) {
                invitation.markAsExpired();
                await this.workspaceInvitationsRepository.updateInvitation(invitation);
                throw new AppError('You are already a member of this workspace', 409);
            }
        } else {
            if (!registrationData) {
                throw new AppError('Registration required. Please provide your name and password.', 400);
            }

            const registeredUser = await this.authService.register({
                email: invitation.email,
                firstName: registrationData.firstName,
                lastName: registrationData.lastName,
                password: registrationData.password
            });

            userId = registeredUser.user.id;
        }

        const newMember = WorkspaceMember.create({
            workspaceId: invitation.workspaceId,
            userId: userId,
            roleIds: invitation.roleIds,
            status: 'active'
        });

        const createdMember = await this.workspaceMembersRepository.create(newMember);

        if (invitation.accountPermissions && Object.keys(invitation.accountPermissions).length > 0) {
            await this.workspaceMembersRepository.saveAccountPermissions(
                createdMember.id,
                invitation.accountPermissions
            );
        }

        invitation.accept(userId);
        await this.workspaceInvitationsRepository.updateInvitation(invitation);

        return { success: true, message: 'Successfully joined workspace' };
    }

    async declineInvitation(token: string): Promise<{ success: boolean; message: string }> {
        const invitation = await this.workspaceInvitationsRepository.findByToken(token);
        if (!invitation) {
            throw new AppError('Invalid invitation', 400);
        }

        if (invitation.status === 'accepted') {
            throw new AppError('Invitation already accepted', 400);
        }

        if (invitation.status === 'expired' || invitation.isExpired()) {
            invitation.markAsExpired();
            await this.workspaceInvitationsRepository.updateInvitation(invitation);
            throw new AppError('Invitation expired', 400);
        }

        invitation.markAsDeclined();
        await this.workspaceInvitationsRepository.updateInvitation(invitation);

        return { success: true, message: 'Successfully declined invitation' };
    }

    async getMyInvitations(userId: string): Promise<any[]> {
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new AppError('User not found', 404);
        }

        const invitations = await this.workspaceInvitationsRepository.findByEmail(user.email);
        
        const validInvitations = [];
        for (const inv of invitations) {
            if (inv.isExpired()) {
                inv.markAsExpired();
                await this.workspaceInvitationsRepository.updateInvitation(inv);
            } else {
                const workspace = await this.workspaceRepository.findById(inv.workspaceId);
                validInvitations.push({
                    id: inv.id,
                    workspaceId: inv.workspaceId,
                    workspaceName: workspace?.name,
                    email: inv.email,
                    roleIds: inv.roleIds,
                    status: inv.status,
                    expiresAt: inv.expiresAt,
                    createdAt: inv.createdAt
                });
            }
        }

        return validInvitations;
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

        if (memberToRemove.isDefault) {
            throw new AppError('Cannot remove workspace creator', 403);
        }

        await this.workspaceMembersRepository.delete(memberIdToRemove);
    }

    async getRoles(workspaceId: string, userId: string, params: { 
        page?: number; 
        limit?: number; 
        search?: string;
        types?: string[];
        minPermissions?: number;
    } = {}): Promise<{ roles: any[]; total: number }> {
        const member = await this.workspaceMembersRepository.findByUserAndWorkspace(userId, workspaceId);
        if (!member) throw new AppError('Not a member of this workspace', 403);

        const page = params.page || 1;
        const limit = params.limit || 10;
        const offset = (page - 1) * limit;

        const { roles, total } = await this.workspaceRoleRepository.findPaginated(workspaceId, {
            limit,
            offset,
            search: params.search,
            types: params.types,
            minPermissions: params.minPermissions
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

        // Prevent editing of Owner role
        if (role.name === 'Owner') throw new AppError('Cannot edit Owner role', 400);
        if (role.isSystem) throw new AppError('Cannot edit system role', 400);

        role.changePermissions(permissions);
        await this.workspaceRoleRepository.save(role);

        // Invalidate permission cache for all members in this workspace
        await PermissionCache.invalidateWorkspace(workspaceId);
    }

    async assignRole(workspaceId: string, userId: string, memberId: string, roleId: string, accountPermissions?: Record<string, { permissions: string[]; denied: string[] }>): Promise<void> {
        console.log('[Service assignRole] START - roleId:', roleId, 'accountPermissions:', accountPermissions);
        
        const hasPermission = await this.checkPermission(workspaceId, userId, 'members:edit');
        if (!hasPermission) throw new AppError('Insufficient permissions to assign roles', 403);

        const member = await this.workspaceMembersRepository.findById(memberId);
        if (!member || member.workspaceId !== workspaceId) throw new AppError('Member not found', 404);

        if (member.isDefault) throw new AppError('Cannot modify workspace creator', 400);

        console.log('[Service assignRole] Looking for role:', roleId, 'workspaceId:', workspaceId);
        const role = await this.workspaceRoleRepository.findById(roleId);
        console.log('[Service assignRole] Found role:', role);
        if (!role || role.workspaceId !== workspaceId) throw new AppError('Role not valid for this workspace', 400);

        member.addRole(roleId);
        
        // Save account permissions if provided
        if (accountPermissions && Object.keys(accountPermissions).length > 0) {
            await this.workspaceMembersRepository.saveAccountPermissions(memberId, accountPermissions);
        }
        
        await this.workspaceMembersRepository.save(member);

        // Invalidate permission cache for the member whose role changed
        await PermissionCache.invalidate(member.userId, workspaceId);
    }

    async deleteRole(workspaceId: string, userId: string, roleId: string): Promise<void> {
        const hasPermission = await this.checkPermission(workspaceId, userId, 'roles:delete');
        if (!hasPermission) throw new AppError('Insufficient permissions to delete roles', 403);

        const role = await this.workspaceRoleRepository.findById(roleId);
        if (!role || role.workspaceId !== workspaceId) throw new AppError('Role not found', 404);

        // Prevent deletion of Owner role
        if (role.name === 'Owner') throw new AppError('Cannot delete Owner role', 400);
        if (role.isSystem) throw new AppError('Cannot delete system role', 400);

        // Check if strictly assigned
        const assignedCount = await this.workspaceMembersRepository.countByRole(roleId);
        if (assignedCount > 0) throw new AppError('Cannot delete role with assigned members', 400);

        await this.workspaceRoleRepository.delete(roleId);

        // Invalidate permission cache for all members in this workspace
        await PermissionCache.invalidateWorkspace(workspaceId);
    }

    async duplicateRole(workspaceId: string, userId: string, roleId: string): Promise<WorkspaceRole> {
        const hasPermission = await this.checkPermission(workspaceId, userId, 'roles:create');
        if (!hasPermission) throw new AppError('Insufficient permissions to duplicate roles', 403);

        const role = await this.workspaceRoleRepository.findById(roleId);
        if (!role || role.workspaceId !== workspaceId) throw new AppError('Role not found', 404);

        // Check if role with same name already exists
        const existing = await this.workspaceRoleRepository.findByNameAndWorkspace(`${role.name} (Copy)`, workspaceId);
        if (existing) throw new AppError('Role "Copy" already exists in this workspace', 400);

        const newRole = WorkspaceRole.create({
            name: `${role.name} (Copy)`,
            description: role.description,
            workspaceId: workspaceId,
            permissions: [...role.permissions]
        });

        await this.workspaceRoleRepository.create(newRole);
        return newRole;
    }

    async uploadLogo(workspaceId: string, userId: string, file: Buffer, filename: string, contentType: string): Promise<{ logoUrl: string }> {
        const member = await this.workspaceMembersRepository.findByUserAndWorkspace(userId, workspaceId);
        if (!member) {
            throw new AppError('Not a member of this workspace', 403);
        }

        const hasPermission = await this.checkPermission(workspaceId, userId, 'workspace:update');
        if (!hasPermission) {
            throw new AppError('Insufficient permissions to upload logo', 403);
        }

        const workspace = await this.workspaceRepository.findById(workspaceId);
        if (!workspace) {
            throw new AppError('Workspace not found', 404);
        }

        const bucket = this.storageService.getBucket('avatars');
        const attachment = await this.storageService.uploadFile({
            file,
            filename: `logo-${workspaceId}-${uuidv4()}`,
            contentType,
            bucket,
            workspaceId,
            userId,
            metadata: { type: 'workspace-logo', workspaceId }
        });

        const logoUrl = this.storageService.getPublicUrl(bucket, attachment.key);

        workspace.updateDetails({ logo: logoUrl });
        await this.workspaceRepository.save(workspace);

        return { logoUrl };
    }

    async getUserWorkspaceContext(workspaceId: string, userId: string) {
        const member = await this.workspaceMembersRepository.findByUserAndWorkspace(userId, workspaceId);
        if (!member) {
            throw new AppError('Not a member of this workspace', 403);
        }

        const roles = await this.workspaceRoleRepository.findByIds(member.roleIds);
        const permissions = this.calculateUserPermissions(roles);
        const accountPermissions = await this.workspaceMembersRepository.getAccountPermissions(member.id);

        return {
            member,
            roles,
            permissions,
            accountPermissions
        };
    }

    async checkPermission(workspaceId: string, userId: string, permission: string): Promise<boolean> {
        const workspace = await this.workspaceRepository.findById(workspaceId);
        if (!workspace) return false;

        if (workspace.ownerId === userId) return true;

        const member = await this.workspaceMembersRepository.findByUserAndWorkspace(userId, workspaceId);
        if (!member) return false;

        if (member.roleIds.length === 0) return false;

        // Check cache first
        const cachedPermissions = await PermissionCache.get(userId, workspaceId);
        if (cachedPermissions) {
            return checkPermissionFromArray(cachedPermissions, permission);
        }

        // Calculate and cache permissions
        const roles = await this.workspaceRoleRepository.findByIds(member.roleIds);
        const allPermissions = this.calculateUserPermissions(roles);
        await PermissionCache.set(userId, allPermissions, workspaceId);

        return checkPermissionFromArray(allPermissions, permission);
    }

    /**
     * Calculate all permissions for a user based on their roles
     */
    private calculateUserPermissions(roles: WorkspaceRole[]): string[] {
        const permissionSet = new Set<string>();
        
        for (const role of roles) {
            for (const perm of role.permissions) {
                if (perm === '*') {
                    // Full wildcard - return all permissions immediately
                    return ['*'];
                }
                permissionSet.add(perm);
            }
        }
        
        return Array.from(permissionSet);
    }
}

/**
 * Check if a permission is granted from a permissions array
 */
function checkPermissionFromArray(permissions: string[], permission: string): boolean {
    // 1. Full Wildcard
    if (permissions.includes('*')) return true;

    // 2. Exact Match
    if (permissions.includes(permission)) return true;

    // 3. Resource Wildcard (e.g. 'members:*' allows 'members:create')
    const parts = permission.split(':');
    if (parts.length > 1) {
        const resourceWildcard = `${parts[0]}:*`;
        if (permissions.includes(resourceWildcard)) return true;
    }

    return false;
}
