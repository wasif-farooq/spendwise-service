import { Entity } from '@shared/Entity';

export interface WorkspaceProps {
    name: string;
    slug: string;
    ownerId?: string;
    description?: string;
    logo?: string;
    website?: string;
    industry?: string;
    size?: string;
    createdAt: Date;
    updatedAt: Date;
}

export class Workspace extends Entity<WorkspaceProps> {
    private constructor(props: WorkspaceProps, id?: string) {
        super(props, id);
    }

    public static create(props: { name: string; slug: string; ownerId?: string; description?: string; logo?: string; website?: string; industry?: string; size?: string }, id?: string): Workspace {
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

    public updateDetails(details: Partial<Pick<WorkspaceProps, 'name' | 'description' | 'logo' | 'website' | 'industry' | 'size'>>): void {
        if (details.name !== undefined) this.props.name = details.name;
        if (details.description !== undefined) this.props.description = details.description;
        if (details.logo !== undefined) this.props.logo = details.logo;
        if (details.website !== undefined) this.props.website = details.website;
        if (details.industry !== undefined) this.props.industry = details.industry;
        if (details.size !== undefined) this.props.size = details.size;
        this.props.updatedAt = new Date();
    }


    get name(): string { return this.props.name; }
    get slug(): string { return this.props.slug; }
    get ownerId(): string | undefined { return this.props.ownerId; }
    get description(): string | undefined { return this.props.description; }
    get logo(): string | undefined { return this.props.logo; }
    get website(): string | undefined { return this.props.website; }
    get industry(): string | undefined { return this.props.industry; }
    get size(): string | undefined { return this.props.size; }
}
