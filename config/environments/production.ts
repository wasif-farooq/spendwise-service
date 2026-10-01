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

// One DB index for every Redis client this process opens — the cache, the
// rate limiter, 2FA/reset codes and the BullMQ queues. Set it when the Redis is
// shared with another application, so the two keyspaces never meet.
const redisDb = int('REDIS_DB', 0);

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
      db: redisDb,
    },
  },

  cache: {
    redis: {
      host: required('REDIS_HOST'),
      port: int('REDIS_PORT', 6379),
      password: optional('REDIS_PASSWORD'),
      db: redisDb,
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
        db: redisDb,
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
    crypto: {
      baseUrl: optional('COINGECKO_BASE_URL', 'https://api.coingecko.com/api/v3'),
      apiKey: optional('COINGECKO_API_KEY'),
      timeoutMs: int('COINGECKO_TIMEOUT_MS', 10000),
      cronEnabled: process.env.CRON_CRYPTO_RATES_ENABLED !== 'false',
      intervalMinutes: int('CRON_CRYPTO_RATES_INTERVAL_MINUTES', 10),
    },
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
        // Extra ID-token audiences for native sign-in (iOS/Android/Expo clients).
        mobileClientIds: optional('GOOGLE_MOBILE_CLIENT_IDS')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
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

  // Paddle Billing. PADDLE_ENV=sandbox targets sandbox-api.paddle.com. The
  // client token is browser-safe and is handed to the web app per checkout;
  // the API key and webhook secret must never leave the server.
  paddle: {
    apiKey: process.env.PADDLE_API_KEY,
    clientToken: process.env.PADDLE_CLIENT_TOKEN,
    webhookSecret: process.env.PADDLE_WEBHOOK_SECRET,
    environment: process.env.PADDLE_ENV === 'sandbox' ? 'sandbox' : 'production',
  },

  // AI receipt scanning (POST /:workspaceId/ai/receipt-scan). Everything is
  // optional: without an API key the scan endpoints answer 503 AI_UNAVAILABLE
  // and the rest of the API boots and runs as usual. Any OpenAI-compatible
  // chat-completions provider with image input works; switching is config only
  // (see .env.example):
  //   AI_BASE_URL       default https://openrouter.ai/api/v1
  //   AI_RECEIPT_MODEL  default nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
  //                     (a free model for testing; free providers may log inputs)
  //   AI_API_KEY        else OPENROUTER_API_KEY on OpenRouter, else OPENCODE_API_KEY
  //   AI_TIMEOUT_MS     whole scan budget incl. one retry (default 45 s: free
  //                     reasoning models take ~20-30 s a call)
  ai: (() => {
    const baseUrl = process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1';
    const onOpenRouter = /openrouter\.ai/i.test(baseUrl);
    return {
      receiptProvider:
        process.env.AI_RECEIPT_PROVIDER || (onOpenRouter ? 'openrouter' : 'opencode'),
      baseUrl,
      apiKey:
        process.env.AI_API_KEY ||
        (onOpenRouter ? process.env.OPENROUTER_API_KEY : process.env.OPENCODE_API_KEY) ||
        '',
      receiptModel:
        process.env.AI_RECEIPT_MODEL || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      freeScansPerMonth: parseInt(process.env.AI_FREE_SCANS_PER_MONTH || '5', 10),
      timeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '45000', 10),
      maxTokens: parseInt(process.env.AI_MAX_TOKENS || '6000', 10),
    };
  })(),

  // Connected accounts (crypto wallets now, Stripe/PayPal later). Everything is
  // optional so the API boots without it:
  //   CONNECTIONS_ENC_KEYS     "1:<base64 32 bytes>[,2:...]" encrypts addresses and
  //                            tokens at rest; without it connecting answers 503
  //   CONNECTIONS_ENC_ACTIVE   key version for new values (default: highest)
  //   ETHERSCAN_API_KEY        EVM chains (Etherscan V2); without it EVM is unavailable
  //   ETHERSCAN_PAID_PLAN      true unlocks chains the free tier doesn't cover
  //   TRONGRID_API_KEY         optional; keyless TronGrid is throttled
  //   SOLANA_RPC_URL           e.g. a Helius URL; default public RPC (throttled)
  //   BITCOIN_ESPLORA_URL      default https://mempool.space/api
  connections: {
    encryption: {
      keys: optional('CONNECTIONS_ENC_KEYS'),
      active: optional('CONNECTIONS_ENC_ACTIVE'),
    },
    httpTimeoutMs: int('CONNECTIONS_HTTP_TIMEOUT_MS', 15000),
    etherscan: {
      baseUrl: optional('ETHERSCAN_BASE_URL', 'https://api.etherscan.io/v2/api'),
      apiKey: optional('ETHERSCAN_API_KEY'),
      paidPlan: bool('ETHERSCAN_PAID_PLAN', false),
    },
    bitcoin: { baseUrl: optional('BITCOIN_ESPLORA_URL', 'https://mempool.space/api') },
    tron: {
      baseUrl: optional('TRONGRID_BASE_URL', 'https://api.trongrid.io'),
      apiKey: optional('TRONGRID_API_KEY'),
    },
    solana: { rpcUrl: optional('SOLANA_RPC_URL') },
    syncCron: {
      enabled: bool('CRON_CONNECTION_SYNC_ENABLED', true),
      intervalMinutes: int('CRON_CONNECTION_SYNC_INTERVAL_MINUTES', 15),
    },
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
