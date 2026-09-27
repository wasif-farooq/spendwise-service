/**
 * Production configuration.
 *
 * Unlike the development config, nothing here falls back to a convenience
 * default for anything security-sensitive. A missing value fails startup with
 * an explicit message rather than silently booting with `password` as the
 * database credential or a well-known JWT signing key.
 */

const missing: string[] = [];
const problems: string[] = [];

/** Read a required variable, collecting (rather than throwing on) omissions. */
const required = (name: string): string => {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    missing.push(name);
    return '';
  }
  return value;
};

const optional = (name: string, fallback = ''): string => process.env[name] || fallback;

const int = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    problems.push(`${name} must be a number (got "${raw}")`);
    return fallback;
  }
  return parsed;
};

const bool = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
};

const jwtSecret = required('JWT_SECRET');
if (jwtSecret && jwtSecret.length < 32) {
  problems.push('JWT_SECRET must be at least 32 characters in production');
}
if (jwtSecret && jwtSecret.includes('development-secret')) {
  problems.push('JWT_SECRET is still set to the development placeholder');
}

// Comma-separated list of the origins allowed to call the API, e.g.
// "https://app.trackmypocket.com,https://trackmypocket.com".
const corsOrigins = required('CORS_ORIGINS')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const config = {
  nodeEnv: 'production',

  server: {
    port: int('PORT', 3000),
    host: '0.0.0.0',
    // Number of reverse proxies in front of the app. Rate limiting keys on
    // req.ip, so this MUST match the deployment:
    //   too low  -> every client shares one bucket and all users lock out
    //   too high -> X-Forwarded-For is spoofable and rate limits are bypassed
    // Left at 0 (directly exposed). Set TRUST_PROXY=1 behind an ingress or LB.
    trustProxy: int('TRUST_PROXY', 0),
    cors: {
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
      exposedHeaders: ['Content-Length'],
      optionsSuccessStatus: 200,
    },
  },

  api: {
    versions: {
      active: ['v1'],
      default: 'v1',
      strategy: 'url',
    },
    rateLimit: {
      windowMs: int('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
      max: int('RATE_LIMIT_MAX', 1000),
    },
  },

  database: {
    postgres: {
      host: required('DB_HOST'),
      port: int('DB_PORT', 5432),
      username: required('DB_USER'),
      password: required('DB_PASSWORD'),
      database: required('DB_NAME'),
      pool: {
        min: int('DB_POOL_MIN', 2),
        max: int('DB_POOL_MAX', 20),
      },
      ssl: bool('DB_SSL', true),
    },
    redis: {
      host: required('REDIS_HOST'),
      port: int('REDIS_PORT', 6379),
      password: optional('REDIS_PASSWORD'),
      db: 0,
    },
  },

  cache: {
    redis: {
      host: required('REDIS_HOST'),
      port: int('REDIS_PORT', 6379),
      password: optional('REDIS_PASSWORD'),
      db: 1,
    },
  },

  messaging: {
    provider: optional('MESSAGE_QUEUE_PROVIDER', 'bullmq'),
    kafka: {
      brokers: optional('KAFKA_BROKERS', '')
        .split(',')
        .map((broker) => broker.trim())
        .filter(Boolean),
      clientId: optional('KAFKA_CLIENT_ID', 'trackmypocket-api'),
      groupId: optional('KAFKA_GROUP_ID', 'trackmypocket-group'),
      topics: {
        authEvents: 'auth-events',
        userEvents: 'user-events',
        notificationEvents: 'notification-events',
      },
    },
    bullmq: {
      connection: {
        host: required('REDIS_HOST'),
        port: int('REDIS_PORT', 6379),
        password: optional('REDIS_PASSWORD'),
      },
    },
  },

  repository: {
    mode: optional('REPOSITORY_MODE', 'direct'),
  },

  exchangeRates: {
    apiKey: optional('EXCHANGE_RATE_API_KEY'),
    baseUrl: optional('EXCHANGE_RATE_BASE_URL', 'https://api.exchangerate-api.com/v4/latest'),
    cronEnabled: process.env.CRON_EXCHANGE_RATES_ENABLED !== 'false',
    cronSchedule: optional('CRON_EXCHANGE_RATES_SCHEDULE', '0 2 * * *'),
  },

  auth: {
    jwt: {
      secret: jwtSecret,
      accessTokenExpiry: optional('JWT_ACCESS_TOKEN_EXPIRY', '15m'),
      refreshTokenExpiry: optional('JWT_REFRESH_TOKEN_EXPIRY', '7d'),
    },
    social: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
      },
      apple: {
        clientId: process.env.APPLE_CLIENT_ID,
        teamId: process.env.APPLE_TEAM_ID,
        keyId: process.env.APPLE_KEY_ID,
        privateKey: process.env.APPLE_PRIVATE_KEY,
        redirectUri: process.env.APPLE_REDIRECT_URI,
      },
    },
  },

  monitoring: {
    logging: {
      level: optional('LOG_LEVEL', 'info'),
      format: 'json',
      file: {
        enabled: bool('LOG_TO_FILE', false),
        path: optional('LOG_FILE_PATH', 'logs/trackmypocket.log'),
      },
    },
    metrics: {
      enabled: bool('METRICS_ENABLED', true),
      port: int('METRICS_PORT', 9090),
      path: '/metrics',
    },
    tracing: {
      enabled: bool('TRACING_ENABLED', false),
      serviceName: 'trackmypocket',
      exporter: 'jaeger',
      endpoint: optional('JAEGER_ENDPOINT'),
    },
  },

  storage: {
    provider: optional('STORAGE_PROVIDER', 'minio'),
    endpoint: required('STORAGE_ENDPOINT'),
    region: optional('STORAGE_REGION', 'us-east-1'),
    // Defaulting these to minioadmin, as development does, would leave object
    // storage wide open in production.
    accessKeyId: required('STORAGE_ACCESS_KEY_ID'),
    secretAccessKey: required('STORAGE_SECRET_ACCESS_KEY'),
    buckets: {
      receipts: optional('STORAGE_BUCKET_RECEIPTS', 'trackmypocket-receipts'),
      avatars: optional('STORAGE_BUCKET_AVATARS', 'trackmypocket-avatars'),
      attachments: optional('STORAGE_BUCKET_ATTACHMENTS', 'trackmypocket-attachments'),
    },
    publicUrl: required('STORAGE_PUBLIC_URL'),
    presignedUrlExpiry: int('STORAGE_PRESIGNED_URL_EXPIRY', 3600),
    maxFileSize: int('STORAGE_MAX_FILE_SIZE', 10485760),
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  },

  mail: {
    host: optional('MAIL_HOST'),
    port: int('MAIL_PORT', 587),
    secure: process.env.MAIL_SMTP_SECURE === 'true' || process.env.MAIL_SMTP_SECURE === 'TLS',
    username: process.env.MAIL_USERNAME,
    password: process.env.MAIL_PASSWORD,
    fromAddress: optional('MAIL_FROM_ADDRESS', 'noreply@trackmypocket.com'),
    fromName: optional('MAIL_FROM_NAME', 'TrackMyPocket'),
  },

  // Optional: payment gateways are feature-flagged, so a deployment without
  // billing should still boot. StripeWebhookHandler refuses to process events
  // when webhookSecret is absent.
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },

  activityLog: {
    enabled: process.env.ACTIVITY_LOG_ENABLED !== 'false',
    captureIp: process.env.ACTIVITY_LOG_CAPTURE_IP !== 'false',
    captureUserAgent: process.env.ACTIVITY_LOG_CAPTURE_USER_AGENT !== 'false',
    partitionMonthsAhead: int('ACTIVITY_LOG_PARTITION_MONTHS_AHEAD', 6),
    batchSize: int('ACTIVITY_LOG_BATCH_SIZE', 50),
    batchTimeoutMs: int('ACTIVITY_LOG_BATCH_TIMEOUT_MS', 2000),
  },
};

if (missing.length > 0 || problems.length > 0) {
  const lines = ['Invalid production configuration.'];

  if (missing.length > 0) {
    lines.push('', 'Missing required environment variables:');
    lines.push(...missing.map((name) => `  - ${name}`));
  }

  if (problems.length > 0) {
    lines.push('', 'Invalid values:');
    lines.push(...problems.map((problem) => `  - ${problem}`));
  }

  lines.push('', 'See .env.example for the full list.');
  throw new Error(lines.join('\n'));
}

export default config;
