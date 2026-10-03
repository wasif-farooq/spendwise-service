export default {
  nodeEnv: 'test',

  server: {
    port: 3001,
    host: '0.0.0.0',
    trustProxy: 0,
    cors: {
      origin: ['http://localhost:3000'],
      credentials: true,
    },
  },

  api: {
    versions: {
      active: ['v1'],
      default: 'v1',
      strategy: 'url',
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 1000,
    },
  },

  database: {
    postgres: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'antigravity',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.TEST_DB_NAME || 'test_antigravity',
      pool: {
        min: 2,
        max: 10,
      },
      ssl: false,
    },
    admin: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'antigravity',
      password: process.env.DB_PASSWORD || 'password',
      database: 'postgres',
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
      clientId: 'trackmypocket-test',
      groupId: 'trackmypocket-test-group',
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

  auth: {
    jwt: {
      secret: 'test-secret',
      accessTokenExpiry: '1h',
      refreshTokenExpiry: '7d',
    },
  },

  monitoring: {
    logging: {
      level: 'error',
      format: 'json',
      file: {
        enabled: false,
        path: 'logs/test.log',
      },
    },
    metrics: {
      enabled: false,
    },
    tracing: {
      enabled: false,
    },
  },
  // AI receipt scanning: no key in tests, so the endpoints answer 503 unless a
  // test injects its own extractor.
  ai: {
    receiptProvider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    receiptModel: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    freeScansPerMonth: 5,
    timeoutMs: 45000,
    maxTokens: 6000,
  },
  // Connected accounts: a fixed test key, no provider keys (tests stub HTTP).
  connections: {
    encryption: { keys: '1:ZGV2LW9ubHktY29ubmVjdGlvbnMta2V5LTMyLWJ5dGU=', active: '' },
    httpTimeoutMs: 15000,
    etherscan: { baseUrl: 'https://api.etherscan.io/v2/api', apiKey: '', paidPlan: false },
    bitcoin: { baseUrl: 'https://mempool.space/api' },
    tron: { baseUrl: 'https://api.trongrid.io', apiKey: '' },
    solana: { rpcUrl: '' },
    stripe: { clientId: '', secretKey: '', redirectUri: '', authorizeUrl: '', apiBaseUrl: '' },
    paypal: { clientId: '', clientSecret: '', redirectUri: '', environment: 'sandbox' },
    syncCron: { enabled: false, intervalMinutes: 15 },
  },
};
