import { Entity } from '@shared/Entity';

export interface OrganizationRoleProps {
    name: string;
    description?: string;
    organizationId: string;
    permissions: string[]; // Simplification for now, maybe JSON or array of strings
    isSystem?: boolean; // To identify 'Admin' role that shouldn't be deleted?
    createdAt: Date;
    updatedAt: Date;
}

export class OrganizationRole extends Entity<OrganizationRoleProps> {
    private constructor(props: OrganizationRoleProps, id?: string) {
        super(props, id);
    }

    public static create(props: {
        name: string;
        organizationId: string;
        permissions: string[];
        description?: string;
        isSystem?: boolean;
    }, id?: string): OrganizationRole {
        const roleProps: OrganizationRoleProps = {
            ...props,
            isSystem: props.isSystem ?? false,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        return new OrganizationRole(roleProps, id);
    }

    public static restore(props: OrganizationRoleProps, id: string): OrganizationRole {
        return new OrganizationRole(props, id);
    }

    public changePermissions(permissions: string[]): void {
        this.props.permissions = permissions;
        this.props.updatedAt = new Date();
    }


    get name(): string { return this.props.name; }
    get organizationId(): string { return this.props.organizationId; }
    get permissions(): string[] { return this.props.permissions; }
    get isSystem(): boolean { return this.props.isSystem ?? false; }
}
