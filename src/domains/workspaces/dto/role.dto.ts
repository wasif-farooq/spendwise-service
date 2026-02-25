export interface CreateRoleDto {
    name: string;
    description?: string;
    permissions: string[];
}

export interface UpdateRoleDto {
    name?: string;
    description?: string;
    permissions?: string[];
}
