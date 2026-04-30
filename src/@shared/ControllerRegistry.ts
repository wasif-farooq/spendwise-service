/**
 * ControllerRegistry - Singleton registry for caching controller instances
 * Uses Registry Pattern with lazy initialization
 * 
 * Note: Both factories AND controllers are cached as singletons
 */
export class ControllerRegistry {
    private static instance: ControllerRegistry;
    private controllers = new Map<string, any>();
    private factories = new Map<string, any>();

    private constructor() {}

    static getInstance(): ControllerRegistry {
        if (!ControllerRegistry.instance) {
            ControllerRegistry.instance = new ControllerRegistry();
        }
        return ControllerRegistry.instance;
    }

    registerFactory(token: string, factory: any): void {
        if (this.factories.has(token)) {
            console.warn(`[ControllerRegistry] Factory already registered for: ${token}`);
            return;
        }
        this.factories.set(token, factory);
    }

    getController(token: string): any {
        if (!this.controllers.has(token)) {
            const factory = this.factories.get(token);
            if (!factory) {
                throw new Error(`No factory registered for token: ${token}`);
            }
            console.log(`[ControllerRegistry] Creating controller for: ${token}`);
            this.controllers.set(token, factory.create());
        }
        return this.controllers.get(token);
    }

    hasFactory(token: string): boolean {
        return this.factories.has(token);
    }

    clear(): void {
        this.controllers.clear();
    }
}