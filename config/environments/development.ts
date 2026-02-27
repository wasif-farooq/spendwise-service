export default {
    nodeEnv: 'development',

    server: {
        port: 3000,
        host: '0.0.0.0',
        cors: {
            origin: [
                'http://localhost:5173',
                'http://localhost:5174',
                'http://127.0.0.1:5173',
                'http://127.0.0.1:5174',
                'http://localhost:3000',
                'http://localhost:3001'
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
                'x-api-version'
            ],
            optionsSuccessStatus: 200
        }
    },

    api: {
        versions: {
            active: ['v1', 'v2'],
            default: 'v1',
            strategy: 'url', // url, header, query
            deprecated: {
                v1: {
                    sunset: '2024-12-31',
                    migrationGuide: '/docs/migration/v1-to-v2'
                }
            }
        },
        rateLimit: {
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100 // limit each IP to 100 requests per windowMs
        }
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
                max: 10
            },
            ssl: false
        },
        redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || '',
            db: 0
        }
    },

    cache: {
        redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || '',
            db: 1
        }
    },

    messaging: {
        kafka: {
            brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
            clientId: 'antigravity',
            groupId: 'antigravity-group',
            topics: {
                authEvents: 'auth-events',
                userEvents: 'user-events',
                notificationEvents: 'notification-events'
            }
        }
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
    },

    auth: {
        jwt: {
            secret: process.env.JWT_SECRET || 'development-secret-change-in-production',
            accessTokenExpiry: '15m',
            refreshTokenExpiry: '7d'
        },
        social: {
            google: {
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'
            },
            apple: {
                clientId: process.env.APPLE_CLIENT_ID,
                teamId: process.env.APPLE_TEAM_ID,
                keyId: process.env.APPLE_KEY_ID,
                privateKey: process.env.APPLE_PRIVATE_KEY,
                redirectUri: process.env.APPLE_REDIRECT_URI || 'http://localhost:3000/auth/apple/callback'
            }
        }
    },

    monitoring: {
        logging: {
            level: 'debug',
            format: 'json',
            file: {
                enabled: true,
                path: 'logs/antigravity.log'
            }
        },
        metrics: {
            enabled: true,
            port: 9090,
            path: '/metrics'
        },
        tracing: {
            enabled: true,
            serviceName: 'antigravity',
            exporter: 'jaeger',
            endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces'
        }
    }
};
