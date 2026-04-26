import { Entity } from '@shared/Entity';

export interface WorkspaceInvitationProps {
    workspaceId: string;
    email: string;
    roleIds: string[];
    accountPermissions?: Record<string, { permissions: string[]; denied: string[] }>;
    token: string;
    status: 'pending' | 'accepted' | 'expired' | 'declined';
    expiresAt: Date;
    invitedBy: string;
    acceptedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

export class WorkspaceInvitation extends Entity<WorkspaceInvitationProps> {
    private constructor(props: WorkspaceInvitationProps, id?: string) {
        super(props, id);
    }

    public static create(props: {
        workspaceId: string;
        email: string;
        roleIds: string[];
        accountPermissions?: Record<string, { permissions: string[]; denied: string[] }>;
        token: string;
        expiresAt: Date;
        invitedBy: string;
    }, id?: string): WorkspaceInvitation {
        const now = new Date();
        const invitationProps: WorkspaceInvitationProps = {
            ...props,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
        };
        return new WorkspaceInvitation(invitationProps, id);
    }

    public static restore(props: WorkspaceInvitationProps, id: string): WorkspaceInvitation {
        return new WorkspaceInvitation(props, id);
    }

    get workspaceId(): string { return this.props.workspaceId; }
    get email(): string { return this.props.email; }
    get roleIds(): string[] { return this.props.roleIds; }
    get accountPermissions(): Record<string, { permissions: string[]; denied: string[] }> | undefined {
        return this.props.accountPermissions;
    }
    get token(): string { return this.props.token; }
    get status(): 'pending' | 'accepted' | 'expired' | 'declined' { return this.props.status; }
    get expiresAt(): Date { return this.props.expiresAt; }
    get invitedBy(): string { return this.props.invitedBy; }
    get acceptedBy(): string | undefined { return this.props.acceptedBy; }
    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }

    public isExpired(): boolean {
        return new Date() > this.props.expiresAt;
    }

    public accept(userId: string): void {
        this.props.status = 'accepted';
        this.props.acceptedBy = userId;
        this.props.updatedAt = new Date();
    }

    public regenerateToken(token: string, expiresAt: Date): void {
        this.props.token = token;
        this.props.expiresAt = expiresAt;
        this.props.updatedAt = new Date();
    }

    public markAsExpired(): void {
        this.props.status = 'expired';
        this.props.updatedAt = new Date();
    }

    public markAsDeclined(): void {
        this.props.status = 'declined';
        this.props.updatedAt = new Date();
    }
}