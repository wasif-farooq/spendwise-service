import 'reflect-metadata';

type Constructor<T = any> = new (...args: any[]) => T;

export class Container {
    private static instance: Container;
    private services = new Map<string, any>();
    private singletons = new Map<string, any>();

    private constructor() { }

    public static getInstance(): Container {
        if (!Container.instance) {
            Container.instance = new Container();
        }
        return Container.instance;
    }

    public register<T>(token: string, implementation: Constructor<T>, options?: { singleton: boolean }) {
        if (options?.singleton) {
            this.singletons.set(token, new implementation());
        } else {
            this.services.set(token, implementation);
        }
    }

    public registerInstance<T>(token: string, instance: T) {
        this.singletons.set(token, instance);
    }

    public resolve<T>(token: string): T {
        if (this.singletons.has(token)) {
            return this.singletons.get(token);
        }

        const Implementation = this.services.get(token);
        if (!Implementation) {
            throw new Error(`Service not found for token: ${token}`);
        }

        return new Implementation();
    }
}
