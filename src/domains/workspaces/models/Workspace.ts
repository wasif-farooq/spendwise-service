import { Entity } from '@shared/Entity';

export interface WorkspaceProps {
    name: string;
    slug: string;
    ownerId?: string;
    createdAt: Date;
    updatedAt: Date;
}

export class Workspace extends Entity<WorkspaceProps> {
    private constructor(props: WorkspaceProps, id?: string) {
        super(props, id);
    }

    public static create(props: { name: string; slug: string; ownerId?: string }, id?: string): Workspace {
        const workspaceProps: WorkspaceProps = {
            ...props,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        return new Workspace(workspaceProps, id);
    }

    public static restore(props: WorkspaceProps, id: string): Workspace {
        return new Workspace(props, id);
    }

    public changeName(name: string): void {
        this.props.name = name;
        this.props.updatedAt = new Date();
    }


    get name(): string { return this.props.name; }
    get slug(): string { return this.props.slug; }
    get ownerId(): string | undefined { return this.props.ownerId; }
}
