import { ConfigLoader } from '@config/ConfigLoader';

/** One of the redis blocks in config/environments/*: database.redis, cache.redis, messaging.bullmq.connection. */
export interface RedisEndpoint {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

/**
 * node-redis connection URL for a config block, including its DB index.
 *
 * Every client used to build `redis://host:port` and so ran on DB 0 whatever the
 * config said, which only matters once the Redis is shared: a deployment that is
 * given its own DB index (REDIS_DB) must actually stay inside it.
 */
export const redisUrl = (endpoint: RedisEndpoint): string => {
  const auth = endpoint.password ? `:${encodeURIComponent(endpoint.password)}@` : '';
  return `redis://${auth}${endpoint.host}:${endpoint.port}/${endpoint.db ?? 0}`;
};

export interface BullMQConnection {
  host: string;
  port: number;
  password?: string;
  db: number;
}

/** ioredis options for BullMQ queues and workers, from messaging.bullmq.connection. */
export const bullmqConnection = (): BullMQConnection => {
  const { connection } = ConfigLoader.getInstance().get('messaging.bullmq');
  return {
    host: connection.host,
    port: connection.port,
    password: connection.password || undefined,
    db: connection.db ?? 0,
  };
};
