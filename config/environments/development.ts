export default {
  nodeEnv: 'development',

  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: '0.0.0.0',
    // Number of reverse proxies in front of the app, so req.ip (and therefore
    // rate limiting) resolves to the real client. 0 = directly exposed.
    // Set TRUST_PROXY=1 when running behind an ingress or load balancer.
    trustProxy: parseInt(process.env.TRUST_PROXY || '0'),
    cors: {
      origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:8081',
        'http://127.0.0.1:8081',
        'http://10.0.2.2:3000',
        'http://10.0.2.2:8081',
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'authorization',
        'content-type',
        'x-api-version',
        'sec-ch-ua',
        'sec-ch-ua-mobile',
        'sec-ch-ua-platform',
        'Sec-Fetch-Dest',
        'Sec-Fetch-Mode',
        'Sec-Fetch-Site',
        'Sec-GPC',
        'User-Agent',
        'Accept-Language',
        'Referer',
        'Connection',
      ],
      exposedHeaders: ['Content-Length', 'Authorization'],
      optionsSuccessStatus: 200,
    },
  },

  api: {
    versions: {
      active: ['v1', 'v2'],
      default: 'v1',
      strategy: 'url', // url, header, query
      deprecated: {
        v1: {
          sunset: '2024-12-31',
          migrationGuide: '/docs/migration/v1-to-v2',
        },
      },
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
    },
  },

  database: {
    postgres: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'antigravity',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'antigravity',
      pool: {
        min: 2,
        max: 10,
      },
      ssl: false,
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || '',
      db: parseInt(process.env.REDIS_DB || '0'),
    },
  },

  cache: {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || '',
      db: parseInt(process.env.REDIS_DB || '0'),
    },
  },

  messaging: {
    provider: process.env.MESSAGE_QUEUE_PROVIDER || 'kafka',
    kafka: {
      brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
      clientId: 'antigravity',
      groupId: 'antigravity-group',
      topics: {
        authEvents: 'auth-events',
        userEvents: 'user-events',
        notificationEvents: 'notification-events',
      },
    },
    bullmq: {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || '',
        db: parseInt(process.env.REDIS_DB || '0'),
      },
    },
  },

  // Toggle between 'rpc' or 'direct' for repository communication
  // Use 'direct' for faster performance, 'rpc' for microservices architecture
  repository: {
    mode: process.env.REPOSITORY_MODE || 'direct', // 'rpc' or 'direct'
  },

  // Exchange Rates Configuration
  exchangeRates: {
    apiKey: process.env.EXCHANGE_RATE_API_KEY || '',
    baseUrl: process.env.EXCHANGE_RATE_BASE_URL || 'https://api.exchangerate-api.com/v4/latest',
    // Cron job settings
    cronEnabled: process.env.CRON_EXCHANGE_RATES_ENABLED !== 'false',
    cronSchedule: process.env.CRON_EXCHANGE_RATES_SCHEDULE || '0 2 * * *', // Daily at 2 AM
    // Crypto rates (CoinGecko /simple/price, stored as USD -> coin). The key is
    // optional: without it the keyless public endpoint is used. A demo key goes
    // in the x-cg-demo-api-key header.
    crypto: {
      baseUrl: process.env.COINGECKO_BASE_URL || 'https://api.coingecko.com/api/v3',
      apiKey: process.env.COINGECKO_API_KEY || '',
      timeoutMs: parseInt(process.env.COINGECKO_TIMEOUT_MS || '10000', 10),
      cronEnabled: process.env.CRON_CRYPTO_RATES_ENABLED !== 'false',
      intervalMinutes: parseInt(process.env.CRON_CRYPTO_RATES_INTERVAL_MINUTES || '10', 10),
    },
  },

  auth: {
    jwt: {
      secret: process.env.JWT_SECRET || 'development-secret-change-in-production',
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
    },
    social: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri:
          process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',
        // Extra ID-token audiences for native sign-in (iOS/Android/Expo clients).
        mobileClientIds: (process.env.GOOGLE_MOBILE_CLIENT_IDS || '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      },
      apple: {
        clientId: process.env.APPLE_CLIENT_ID,
        teamId: process.env.APPLE_TEAM_ID,
        keyId: process.env.APPLE_KEY_ID,
        privateKey: process.env.APPLE_PRIVATE_KEY,
        redirectUri: process.env.APPLE_REDIRECT_URI || 'http://localhost:3000/auth/apple/callback',
      },
    },
  },

  monitoring: {
    logging: {
      level: 'debug',
      format: 'json',
      file: {
        enabled: true,
        path: 'logs/antigravity.log',
      },
    },
    metrics: {
      enabled: true,
      port: 9090,
      path: '/metrics',
    },
    tracing: {
      enabled: true,
      serviceName: 'antigravity',
      exporter: 'jaeger',
      endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    },
  },

  // Object Storage Configuration (MinIO/S3)
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'minio',
    endpoint: process.env.STORAGE_ENDPOINT || 'http://localhost:9000',
    region: process.env.STORAGE_REGION || 'us-east-1',
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || 'minioadmin',
    buckets: {
      receipts: process.env.STORAGE_BUCKET_RECEIPTS || 'trackmypocket-receipts',
      avatars: process.env.STORAGE_BUCKET_AVATARS || 'trackmypocket-avatars',
      attachments: process.env.STORAGE_BUCKET_ATTACHMENTS || 'trackmypocket-attachments',
    },
    publicUrl: process.env.STORAGE_PUBLIC_URL || 'http://localhost:9000',
    presignedUrlExpiry: parseInt(process.env.STORAGE_PRESIGNED_URL_EXPIRY || '3600'), // 1 hour default
    maxFileSize: parseInt(process.env.STORAGE_MAX_FILE_SIZE || '10485760'), // 10MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  },

  // Email Configuration (Mailtrap/SMTP)
  mail: {
    host: process.env.MAIL_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.MAIL_PORT || '25'),
    secure: process.env.MAIL_SMTP_SECURE === 'true' || process.env.MAIL_SMTP_SECURE === 'TLS',
    username: process.env.MAIL_USERNAME,
    password: process.env.MAIL_PASSWORD,
    fromAddress: process.env.MAIL_FROM_ADDRESS || 'noreply@trackmypocket.com',
    fromName: process.env.MAIL_FROM_NAME || 'TrackMyPocket',
  },

  // Stripe Configuration
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
    environment: process.env.PADDLE_ENV === 'production' ? 'production' : 'sandbox',
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

  // Activity Log Configuration
  // Connected accounts (see production.ts for the variables). Development
  // falls back to a fixed, well-known encryption key so connecting works
  // out of the box; never use it anywhere else.
  connections: {
    encryption: {
      keys:
        process.env.CONNECTIONS_ENC_KEYS ||
        '1:ZGV2LW9ubHktY29ubmVjdGlvbnMta2V5LTMyLWJ5dGU=',
      active: process.env.CONNECTIONS_ENC_ACTIVE || '',
    },
    httpTimeoutMs: parseInt(process.env.CONNECTIONS_HTTP_TIMEOUT_MS || '15000', 10),
    etherscan: {
      baseUrl: process.env.ETHERSCAN_BASE_URL || 'https://api.etherscan.io/v2/api',
      apiKey: process.env.ETHERSCAN_API_KEY || '',
      paidPlan: process.env.ETHERSCAN_PAID_PLAN === 'true',
    },
    bitcoin: { baseUrl: process.env.BITCOIN_ESPLORA_URL || 'https://mempool.space/api' },
    tron: {
      baseUrl: process.env.TRONGRID_BASE_URL || 'https://api.trongrid.io',
      apiKey: process.env.TRONGRID_API_KEY || '',
    },
    solana: { rpcUrl: process.env.SOLANA_RPC_URL || '' },
    syncCron: {
      enabled: process.env.CRON_CONNECTION_SYNC_ENABLED !== 'false',
      intervalMinutes: parseInt(process.env.CRON_CONNECTION_SYNC_INTERVAL_MINUTES || '15', 10),
    },
  },

  activityLog: {
    enabled: process.env.ACTIVITY_LOG_ENABLED !== 'false',
    captureIp: process.env.ACTIVITY_LOG_CAPTURE_IP !== 'false',
    captureUserAgent: process.env.ACTIVITY_LOG_CAPTURE_USER_AGENT !== 'false',
    partitionMonthsAhead: parseInt(process.env.ACTIVITY_LOG_PARTITION_MONTHS_AHEAD || '6'),
    batchSize: parseInt(process.env.ACTIVITY_LOG_BATCH_SIZE || '50'),
    batchTimeoutMs: parseInt(process.env.ACTIVITY_LOG_BATCH_TIMEOUT_MS || '2000'),
  },
};
