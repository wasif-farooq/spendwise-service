import { randomUUID } from 'crypto';

export abstract class Entity<T> {
    protected readonly _id: string;
    protected props: T;

    constructor(props: T, id?: string) {
        this._id = id ? id : randomUUID();
        this.props = props;
    }

    get id(): string {
        return this._id;
    }

    public getProps(): T {
        return { ...this.props };
    }

    public toJSON(): any {
        return {
            id: this._id,
            ...this.props
        };
    }
}
