import { createClient, RedisClientType } from 'redis';
import { ConfigLoader } from '@config/ConfigLoader';
import { redisUrl } from '@database/redisConnection';

export class RedisFactory {
  createClient(): RedisClientType {
    const config = ConfigLoader.getInstance();
    const redisConfig = config.get('cache.redis');

    // Password and DB index included: this is the connection the rate limiter,
    // 2FA and password-reset codes use.
    const client = createClient({ url: redisUrl(redisConfig) });

    client.on('error', (err) => console.error('Redis Client Error', err));

    // We might want to connect here or let the user connect
    // client.connect();

    return client as RedisClientType;
  }
}
