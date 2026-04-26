import { Entity } from '@shared/Entity';

export interface WorkspaceMemberProps {
    userId: string;
    workspaceId: string;
    roleIds: string[];
    joinedAt: Date;
    status?: 'active' | 'inactive' | 'suspended' | 'pending';
    isDefault?: boolean;
}

export class WorkspaceMember extends Entity<WorkspaceMemberProps> {
    private constructor(props: WorkspaceMemberProps, id?: string) {
        super(props, id);
    }

public static create(props: {
        userId: string;
        workspaceId: string;
        roleIds: string[];
        status?: 'active' | 'inactive' | 'suspended' | 'pending';
        isDefault?: boolean;
    }, id?: string): WorkspaceMember {
        const memberProps: WorkspaceMemberProps = {
            ...props,
            status: props.status || 'active',
            joinedAt: new Date(),
        };
        return new WorkspaceMember(memberProps, id);
    }

    public static restore(props: WorkspaceMemberProps, id: string): WorkspaceMember {
        return new WorkspaceMember(props, id);
    }

    get userId(): string { return this.props.userId; }
    get workspaceId(): string { return this.props.workspaceId; }
    get roleIds(): string[] { return this.props.roleIds; }
    get status(): 'active' | 'inactive' | 'suspended' | 'pending' { return this.props.status || 'active'; }
    get isDefault(): boolean { return this.props.isDefault || false; }

    public makeDefault(): void {
        this.props.isDefault = true;
    }

    public addRole(roleId: string): void {
        if (!this.props.roleIds.includes(roleId)) {
            this.props.roleIds.push(roleId);
        }
    }

    public removeRole(roleId: string): void {
        this.props.roleIds = this.props.roleIds.filter(id => id !== roleId);
    }

    public setRoles(roleIds: string[]): void {
        this.props.roleIds = roleIds;
    }

    public updateStatus(status: 'active' | 'inactive' | 'suspended' | 'pending'): void {
        this.props.status = status;
    }
}
