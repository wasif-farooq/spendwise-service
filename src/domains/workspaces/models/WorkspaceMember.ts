import { Entity } from '@shared/Entity';

export interface WorkspaceMemberProps {
    userId: string;
    workspaceId: string;
    roleIds: string[];
    joinedAt: Date;
}

export class WorkspaceMember extends Entity<WorkspaceMemberProps> {
    private constructor(props: WorkspaceMemberProps, id?: string) {
        super(props, id);
    }

    public static create(props: {
        userId: string;
        workspaceId: string;
        roleIds: string[];
    }, id?: string): WorkspaceMember {
        const memberProps: WorkspaceMemberProps = {
            ...props,
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

    public addRole(roleId: string): void {
        if (!this.props.roleIds.includes(roleId)) {
            this.props.roleIds.push(roleId);
        }
    }

    public removeRole(roleId: string): void {
        this.props.roleIds = this.props.roleIds.filter(id => id !== roleId);
    }
}
