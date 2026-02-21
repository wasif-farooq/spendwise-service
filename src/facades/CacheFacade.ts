import { ICache } from '@interfaces/ICache';
import { CacheAbstractFactory } from '@abstract-factories/CacheAbstractFactory';

export class CacheFacade {
    private cache: ICache;

    constructor(private factory: CacheAbstractFactory) {
        this.cache = this.factory.createCache();
    }

    async connect(): Promise<void> {
        await this.cache.connect();
    }

    async disconnect(): Promise<void> {
        await this.cache.disconnect();
    }

    async get<T>(key: string): Promise<T | null> {
        const value = await this.cache.get(key);
        if (!value) return null;
        try {
            return JSON.parse(value) as T;
        } catch {
            return value as unknown as T;
        }
    }

    async set(key: string, value: any, ttl?: number): Promise<void> {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        await this.cache.set(key, stringValue, ttl);
    }

    async del(key: string): Promise<void> {
        await this.cache.del(key);
    }
}
