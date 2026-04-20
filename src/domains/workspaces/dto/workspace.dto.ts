export interface CreateWorkspaceDto {
    name: string;
    slug?: string;
    description?: string;
    logo?: string;
    website?: string;
    industry?: string;
    size?: string;
}

export interface UpdateWorkspaceDto {
    name?: string;
    slug?: string;
    description?: string;
    logo?: string;
    website?: string;
    industry?: string;
    size?: string;
}

export interface InviteMemberDto {
    email: string;
    roleName: string; // e.g. 'Owner', 'Member'
    accountPermissions?: Record<string, {
        permissions: string[];
        denied: string[];
    }>;
}

export interface WorkspaceDto {
    id: string;
    name: string;
    slug: string;
    ownerId: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface UpdateRoleDto {
    permissions: string[];
}

export interface AssignRoleDto {
    roleId: string;
}

export interface UpdateMemberDto {
    role?: string;
    roleName?: string;
    status?: 'active' | 'inactive' | 'suspended';
    accountPermissions?: Record<string, {
        permissions: string[];
        denied: string[];
    }>;
}

export interface WorkspaceSettingsDto {
    allowMemberInvites?: boolean;
    requireEmailVerification?: boolean;
    defaultRole?: string;
    billingEmail?: string;
    notificationEmail?: string;
}
