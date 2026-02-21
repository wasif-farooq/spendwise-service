import { ICache } from '@interfaces/ICache';
import { createClient } from 'redis';
import { ConfigLoader } from '@config/ConfigLoader';

export class RedisCache implements ICache {
    private client: any;
    private connected: boolean = false;

    constructor() {
        const config = ConfigLoader.getInstance();
        const redisConfig = config.get('database.redis');

        // Redis URL format: redis://[:password@]host[:port][/db-number]
        const url = `redis://${redisConfig.password ? ':' + redisConfig.password + '@' : ''}${redisConfig.host}:${redisConfig.port}`;

        this.client = createClient({ url });

        this.client.on('error', (err: any) => console.error('Redis Client Error', err));
    }

    async connect(): Promise<void> {
        await this.client.connect();
        this.connected = true;
    }

    async disconnect(): Promise<void> {
        await this.client.disconnect();
        this.connected = false;
    }

    async get(key: string): Promise<string | null> {
        return await this.client.get(key);
    }

    async set(key: string, value: string, ttl?: number): Promise<void> {
        if (ttl) {
            await this.client.set(key, value, { EX: ttl });
        } else {
            await this.client.set(key, value);
        }
    }

    async del(key: string): Promise<void> {
        await this.client.del(key);
    }
}
