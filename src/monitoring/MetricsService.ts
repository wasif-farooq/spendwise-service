import client from 'prom-client';

export class MetricsService {
    private static instance: MetricsService;
    private registry: client.Registry;

    private constructor() {
        this.registry = new client.Registry();
        this.initializeDefaultMetrics();
    }

    public static getInstance(): MetricsService {
        if (!MetricsService.instance) {
            MetricsService.instance = new MetricsService();
        }
        return MetricsService.instance;
    }

    private initializeDefaultMetrics() {
        // Collect default metrics (CPU, Memory, Event Loop, etc.)
        client.collectDefaultMetrics({ register: this.registry });
    }

    public async getMetrics(): Promise<string> {
        return this.registry.metrics();
    }

    public getContentType(): string {
        return this.registry.contentType;
    }

    public getRegistry(): client.Registry {
        return this.registry;
    }
}
