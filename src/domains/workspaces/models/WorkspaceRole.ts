import { Entity } from '@shared/Entity';

export interface WorkspaceRoleProps {
    name: string;
    description?: string;
    workspaceId: string;
    permissions: string[]; // Simplification for now, maybe JSON or array of strings
    isSystem?: boolean; // To identify 'Admin' role that shouldn't be deleted?
    createdAt: Date;
    updatedAt: Date;
}

export class WorkspaceRole extends Entity<WorkspaceRoleProps> {
    private constructor(props: WorkspaceRoleProps, id?: string) {
        super(props, id);
    }

    public static create(props: {
        name: string;
        workspaceId: string;
        permissions: string[];
        description?: string;
        isSystem?: boolean;
    }, id?: string): WorkspaceRole {
        const roleProps: WorkspaceRoleProps = {
            ...props,
            isSystem: props.isSystem ?? false,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        return new WorkspaceRole(roleProps, id);
    }

    public static restore(props: WorkspaceRoleProps, id: string): WorkspaceRole {
        return new WorkspaceRole(props, id);
    }

    public changePermissions(permissions: string[]): void {
        this.props.permissions = permissions;
        this.props.updatedAt = new Date();
    }


    get name(): string { return this.props.name; }
    get workspaceId(): string { return this.props.workspaceId; }
    get permissions(): string[] { return this.props.permissions; }
    get isSystem(): boolean { return this.props.isSystem ?? false; }
}
