import { Entity } from '@shared/Entity';

export interface OrganizationMemberProps {
    userId: string;
    organizationId: string;
    roleIds: string[];
    joinedAt: Date;
}

export class OrganizationMember extends Entity<OrganizationMemberProps> {
    private constructor(props: OrganizationMemberProps, id?: string) {
        super(props, id);
    }

    public static create(props: {
        userId: string;
        organizationId: string;
        roleIds: string[];
    }, id?: string): OrganizationMember {
        const memberProps: OrganizationMemberProps = {
            ...props,
            joinedAt: new Date(),
        };
        return new OrganizationMember(memberProps, id);
    }

    public static restore(props: OrganizationMemberProps, id: string): OrganizationMember {
        return new OrganizationMember(props, id);
    }

    get userId(): string { return this.props.userId; }
    get organizationId(): string { return this.props.organizationId; }
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
