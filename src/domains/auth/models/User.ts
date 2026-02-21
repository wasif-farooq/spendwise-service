import { Entity } from '@shared/Entity';

export enum UserRole {
    CUSTOMER = 'customer',
    PRO = 'pro',
    STAFF = 'staff',
    SUPER_ADMIN = 'SUPER_ADMIN'
}

export interface UserProps {
    email: string;
    firstName?: string;
    lastName?: string;
    isActive: boolean; // Deprecated in favor of status? keeping for compatibility unless asked to remove.
    status: string;
    role: UserRole;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
    // 2FA Properties
    twoFactorEnabled?: boolean;
    twoFactorMethod?: 'app' | 'sms' | 'email'; // Primary method
    twoFactorMethods?: { type: 'app' | 'sms' | 'email'; verified: boolean; target?: string }[];
    twoFactorSecret?: string; // Secret for TOTP (app)
    backupCodes?: string[];
    // Email Verification
    emailVerified?: boolean;
    emailVerificationCode?: string;
    emailVerifiedAt?: Date;
}

export class User extends Entity<UserProps> {
    private constructor(props: UserProps, id?: string) {
        super(props, id);
    }

    public static create(props: {
        email: string;
        firstName?: string;
        lastName?: string;
        role?: UserRole;
        status?: string
    }, id?: string): User {
        const userProps: UserProps = {
            ...props,
            isActive: true,
            status: props.status || 'active',
            role: props.role || UserRole.PRO,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            twoFactorEnabled: false,
            emailVerified: false
        };
        return new User(userProps, id);
    }

    // Static restore method to rehydrate from DB without defaults
    public static restore(props: UserProps, id: string): User {
        return new User(props, id);
    }

    get email(): string { return this.props.email; }
    get firstName(): string | undefined { return this.props.firstName; }
    get lastName(): string | undefined { return this.props.lastName; }
    get isActive(): boolean { return this.props.isActive; }
    get role(): UserRole { return this.props.role; }
    get status(): string { return this.props.status; }
    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }
    get deletedAt(): Date | undefined | null { return this.props.deletedAt; }

    // 2FA Getters
    get twoFactorEnabled(): boolean { return this.props.twoFactorEnabled ?? false; }
    get twoFactorMethod(): string | undefined { return this.props.twoFactorMethod; }
    get twoFactorSecret(): string | undefined { return this.props.twoFactorSecret; }
    get backupCodes(): string[] { return this.props.backupCodes ?? []; }
    get twoFactorMethods(): { type: 'app' | 'sms' | 'email'; verified: boolean; target?: string }[] { return this.props.twoFactorMethods ?? []; }
    get emailVerified(): boolean { return this.props.emailVerified ?? false; }
    get emailVerificationCode(): string | undefined { return this.props.emailVerificationCode; }
    get emailVerifiedAt(): Date | undefined { return this.props.emailVerifiedAt; }

    public updateName(firstName: string, lastName: string) {
        this.props.firstName = firstName;
        this.props.lastName = lastName;
        this.props.updatedAt = new Date();
    }

    public enable2FA(method: 'app' | 'sms' | 'email', secret: string, backupCodes: string[], target?: string) {
        this.props.twoFactorEnabled = true;

        // If it's the first method or explicitly being enabled, set it as active
        if (!this.props.twoFactorMethod) {
            this.props.twoFactorMethod = method;
        }

        // App method usually has a unique secret. SMS/Email might not need it stored here if handled differently.
        if (method === 'app') {
            this.props.twoFactorSecret = secret;
        }

        this.props.backupCodes = backupCodes;

        // Update methods array
        const methods = this.props.twoFactorMethods || [];
        const existing = methods.find(m => m.type === method);
        if (existing) {
            existing.verified = true;
            existing.target = target;
        } else {
            methods.push({ type: method, verified: true, target });
        }
        this.props.twoFactorMethods = [...methods];

        this.props.updatedAt = new Date();
    }

    public disableMethod(method: 'app' | 'sms' | 'email') {
        const methods = this.props.twoFactorMethods || [];
        this.props.twoFactorMethods = methods.filter(m => m.type !== method);

        if (this.props.twoFactorMethod === method) {
            const next = this.props.twoFactorMethods[0];
            this.props.twoFactorMethod = next ? next.type : undefined;
        }

        if (this.props.twoFactorMethods.length === 0) {
            this.disable2FA();
        }

        if (method === 'app') {
            this.props.twoFactorSecret = undefined;
        }

        this.props.updatedAt = new Date();
    }

    public disable2FA() {
        this.props.twoFactorEnabled = false;
        this.props.twoFactorMethod = undefined;
        this.props.twoFactorSecret = undefined;
        this.props.backupCodes = undefined;
        this.props.twoFactorMethods = []; // Or keep them but mark unverified? disabling usually clears all.
        this.props.updatedAt = new Date();
    }

    public updateBackupCodes(backupCodes: string[]) {
        this.props.backupCodes = backupCodes;
        this.props.updatedAt = new Date();
    }

    public delete() {
        this.props.deletedAt = new Date();
        this.props.isActive = false;
        this.props.status = 'deleted';
    }

    public setEmailVerificationCode(code: string) {
        this.props.emailVerificationCode = code;
        this.props.updatedAt = new Date();
    }

    public verifyEmail() {
        this.props.emailVerified = true;
        this.props.emailVerificationCode = undefined;
        this.props.emailVerifiedAt = new Date();
        this.props.updatedAt = new Date();
    }
}
