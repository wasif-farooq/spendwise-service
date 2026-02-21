import { Entity } from '@shared/Entity';

export interface UserPreferenceProps {
    userId: string;
    theme: string;
    language: string;
    timezone: string;
    color: string;
    notifications: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

export class UserPreference extends Entity<UserPreferenceProps> {
    private constructor(props: UserPreferenceProps, id?: string) {
        super(props, id);
    }

    public static create(props: {
        userId: string;
        theme?: string;
        language?: string;
        timezone?: string;
        color?: string;
        notifications?: Record<string, any>;
    }, id?: string): UserPreference {
        return new UserPreference({
            userId: props.userId,
            theme: props.theme || 'system',
            language: props.language || 'en',
            timezone: props.timezone || 'UTC',
            color: props.color || 'blue',
            notifications: props.notifications || {},
            createdAt: new Date(),
            updatedAt: new Date()
        }, id);
    }

    public static restore(props: UserPreferenceProps, id: string): UserPreference {
        return new UserPreference(props, id);
    }

    get userId(): string { return this.props.userId; }
    get theme(): string { return this.props.theme; }
    get language(): string { return this.props.language; }
    get timezone(): string { return this.props.timezone; }
    get color(): string { return this.props.color; }
    get notifications(): Record<string, any> { return this.props.notifications; }

    public update(props: Partial<{
        theme: string;
        language: string;
        timezone: string;
        color: string;
        notifications: Record<string, any>;
    }>): void {
        if (props.theme) this.props.theme = props.theme;
        if (props.language) this.props.language = props.language;
        if (props.timezone) this.props.timezone = props.timezone;
        if (props.color) this.props.color = props.color;
        if (props.notifications) this.props.notifications = props.notifications;
        this.props.updatedAt = new Date();
    }
    public toDTO(): UserPreferenceProps {
        return { ...this.props };
    }
}

