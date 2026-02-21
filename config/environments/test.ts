export default {
    nodeEnv: 'test',

    server: {
        port: 3001,
        host: '0.0.0.0',
        cors: {
            origin: ['http://localhost:3000'],
            credentials: true
        }
    },

    api: {
        versions: {
            active: ['v1'],
            default: 'v1',
            strategy: 'url'
        },
        rateLimit: {
            windowMs: 15 * 60 * 1000,
            max: 1000
        }
    },

    database: {
        postgres: {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            username: process.env.DB_USER || 'antigravity',
            password: process.env.DB_PASSWORD || 'password',
            database: process.env.DB_TEST_NAME || 'antigravity',
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
            db: 2
        }
    },

    cache: {
        redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || '',
            db: 3
        }
    },

    messaging: {
        kafka: {
            brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
            clientId: 'spendwise-test',
            groupId: 'spendwise-test-group'
        }
    },

    auth: {
        jwt: {
            secret: 'test-secret',
            accessTokenExpiry: '1h',
            refreshTokenExpiry: '7d'
        }
    },

    monitoring: {
        logging: {
            level: 'error',
            format: 'json',
            file: {
                enabled: false,
                path: 'logs/test.log'
            }
        },
        metrics: {
            enabled: false
        },
        tracing: {
            enabled: false
        }
    }
};
