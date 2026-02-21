export interface FeatureFlagProps {
    id?: string;
    key: string;
    description?: string;
    isEnabled: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

export class FeatureFlag {
    public readonly id?: string;
    public readonly key: string;
    public readonly description?: string;
    public readonly isEnabled: boolean;
    public readonly createdAt?: Date;
    public readonly updatedAt?: Date;

    private constructor(props: FeatureFlagProps) {
        this.id = props.id;
        this.key = props.key;
        this.description = props.description;
        this.isEnabled = props.isEnabled;
        this.createdAt = props.createdAt;
        this.updatedAt = props.updatedAt;
    }

    public static create(props: FeatureFlagProps): FeatureFlag {
        return new FeatureFlag(props);
    }

    public static reconstitute(props: FeatureFlagProps): FeatureFlag {
        return new FeatureFlag(props);
    }
}
