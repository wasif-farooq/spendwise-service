export interface CategoryProps {
    id?: string;
    name: string;
    type: 'income' | 'expense' | 'all';
    icon?: string;
    color?: string;
    workspaceId: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export class Category {
    private props: CategoryProps;

    constructor(props: CategoryProps) {
        this.props = props;
    }

    static create(props: CategoryProps) {
        return new Category(props);
    }

    get id(): string | undefined {
        return this.props.id;
    }

    get name(): string {
        return this.props.name;
    }

    get type(): 'income' | 'expense' | 'all' {
        return this.props.type;
    }

    get icon(): string | undefined {
        return this.props.icon;
    }

    get color(): string | undefined {
        return this.props.color;
    }

    get workspaceId(): string {
        return this.props.workspaceId;
    }

    getProps(): CategoryProps {
        return { ...this.props };
    }
}
