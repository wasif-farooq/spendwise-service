import { Entity } from '@shared/Entity';

export interface AuthIdentityProps {
    userId: string;
    provider: 'local' | 'google' | 'apple';
    sub?: string; // Subject identifier or email
    passwordHash?: string;
    lastLoginAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

export class AuthIdentity extends Entity<AuthIdentityProps> {
    private constructor(props: AuthIdentityProps, id?: string) {
        super(props, id);
    }

    public static create(props: AuthIdentityProps, id?: string): AuthIdentity {
        return new AuthIdentity({
            ...props,
            createdAt: props.createdAt || new Date(),
            updatedAt: props.updatedAt || new Date()
        }, id);
    }

    get userId(): string { return this.props.userId; }
    get provider(): string { return this.props.provider; }
    get passwordHash(): string | undefined { return this.props.passwordHash; }
    get updatedAt(): Date | undefined { return this.props.updatedAt; }

    public updateLastLogin() {
        this.props.lastLoginAt = new Date();
        this.props.updatedAt = new Date();
    }

    public changePassword(passwordHash: string) {
        this.props.passwordHash = passwordHash;
        this.props.updatedAt = new Date();
    }
}
