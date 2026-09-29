import { redisUrl } from '@database/redisConnection';
import path from 'path';

const CONFIG_DIR = path.resolve(__dirname, '../../../config/environments');

describe('production config module', () => {
  const originalEnv = process.env;

  const loadProduction = () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(path.join(CONFIG_DIR, 'production')).default;
  };

  const validEnv = () => ({
    ...originalEnv,
    NODE_ENV: 'production',
    JWT_SECRET: 'a'.repeat(48),
    CORS_ORIGINS: 'https://app.example.com, https://example.com',
    DB_HOST: 'postgres',
    DB_USER: 'app',
    DB_PASSWORD: 'super-secret',
    DB_NAME: 'trackmypocket',
    REDIS_HOST: 'redis',
    STORAGE_ENDPOINT: 'https://s3.example.com',
    STORAGE_PUBLIC_URL: 'https://cdn.example.com',
    STORAGE_ACCESS_KEY_ID: 'key',
    STORAGE_SECRET_ACCESS_KEY: 'secret',
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  it('loads when every required variable is present', () => {
    process.env = validEnv() as any;

    const config = loadProduction();

    expect(config.nodeEnv).toBe('production');
    expect(config.auth.jwt.secret).toBe('a'.repeat(48));
    expect(config.database.postgres.password).toBe('super-secret');
  });

  it('parses CORS origins into a trimmed list', () => {
    process.env = validEnv() as any;

    expect(loadProduction().server.cors.origin).toEqual([
      'https://app.example.com',
      'https://example.com',
    ]);
  });

  it('never falls back to development credentials', () => {
    process.env = validEnv() as any;
    const config = loadProduction();

    expect(config.database.postgres.password).not.toBe('password');
    expect(config.database.postgres.username).not.toBe('antigravity');
    expect(config.storage.accessKeyId).not.toBe('minioadmin');
    expect(config.storage.secretAccessKey).not.toBe('minioadmin');
    expect(config.auth.jwt.secret).not.toContain('development-secret');
  });

  it('lists every missing variable at once', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' } as any;
    delete (process.env as any).JWT_SECRET;
    delete (process.env as any).DB_HOST;
    delete (process.env as any).CORS_ORIGINS;
    delete (process.env as any).DB_USER;
    delete (process.env as any).DB_PASSWORD;
    delete (process.env as any).DB_NAME;
    delete (process.env as any).REDIS_HOST;
    delete (process.env as any).STORAGE_ENDPOINT;
    delete (process.env as any).STORAGE_PUBLIC_URL;
    delete (process.env as any).STORAGE_ACCESS_KEY_ID;
    delete (process.env as any).STORAGE_SECRET_ACCESS_KEY;

    expect(loadProduction).toThrow(/Missing required environment variables/);

    try {
      loadProduction();
    } catch (error: any) {
      // One failure should surface the whole list, not just the first.
      expect(error.message).toContain('JWT_SECRET');
      expect(error.message).toContain('DB_HOST');
      expect(error.message).toContain('CORS_ORIGINS');
      expect(error.message).toContain('STORAGE_ACCESS_KEY_ID');
    }
  });

  it('rejects a short JWT secret', () => {
    process.env = { ...validEnv(), JWT_SECRET: 'too-short' } as any;

    expect(loadProduction).toThrow(/at least 32 characters/);
  });

  it('rejects the development placeholder secret', () => {
    process.env = {
      ...validEnv(),
      JWT_SECRET: 'development-secret-change-in-production-padding',
    } as any;

    expect(loadProduction).toThrow(/development placeholder/);
  });

  it('rejects a non-numeric port', () => {
    process.env = { ...validEnv(), DB_PORT: 'not-a-number' } as any;

    expect(loadProduction).toThrow(/DB_PORT must be a number/);
  });

  it('puts every Redis client on REDIS_DB', () => {
    process.env = { ...validEnv(), REDIS_DB: '1' } as any;
    const config = loadProduction();

    expect(config.database.redis.db).toBe(1);
    expect(config.cache.redis.db).toBe(1);
    expect(config.messaging.bullmq.connection.db).toBe(1);
  });

  it('defaults REDIS_DB to 0', () => {
    process.env = validEnv() as any;
    delete (process.env as any).REDIS_DB;

    expect(loadProduction().messaging.bullmq.connection.db).toBe(0);
  });

  it('leaves optional payment config unset without failing', () => {
    process.env = validEnv() as any;
    delete (process.env as any).STRIPE_SECRET_KEY;
    delete (process.env as any).STRIPE_WEBHOOK_SECRET;

    const config = loadProduction();

    expect(config.stripe.secretKey).toBeUndefined();
    expect(config.stripe.webhookSecret).toBeUndefined();
  });
});

describe('redisUrl', () => {
  it('selects the configured DB index', () => {
    expect(redisUrl({ host: 'redis', port: 6379, db: 1 })).toBe('redis://redis:6379/1');
  });

  it('defaults to DB 0 when no index is configured', () => {
    expect(redisUrl({ host: 'localhost', port: 6380 })).toBe('redis://localhost:6380/0');
  });

  it('includes an encoded password when one is set', () => {
    expect(redisUrl({ host: 'redis', port: 6379, password: 'p@ss/word', db: 2 })).toBe(
      'redis://:p%40ss%2Fword@redis:6379/2',
    );
  });

  it('omits auth for an empty password', () => {
    expect(redisUrl({ host: 'redis', port: 6379, password: '', db: 0 })).toBe(
      'redis://redis:6379/0',
    );
  });
});
