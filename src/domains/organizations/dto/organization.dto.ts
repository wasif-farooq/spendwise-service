export interface UpdateOrganizationDto {
    name?: string;
    slug?: string; // Optional, might be immutable usually but good to have DTO support
}

export interface InviteMemberDto {
    email: string;
    roleName: string; // e.g. 'Admin', 'Member'
}

export interface OrganizationDto {
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
