import { createClient, RedisClientType } from 'redis';
import { ConfigLoader } from '@config/ConfigLoader';

export class RedisFactory {
    createClient(): RedisClientType {
        const config = ConfigLoader.getInstance();
        const redisConfig = config.get('cache.redis');

        const client = createClient({
            url: `redis://${redisConfig.host}:${redisConfig.port}`
        });

        client.on('error', (err) => console.error('Redis Client Error', err));

        // We might want to connect here or let the user connect
        // client.connect(); 

        return client as RedisClientType;
    }
}
