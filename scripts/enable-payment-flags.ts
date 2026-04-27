import { Client } from 'pg';
import { ConfigLoader } from '../src/config/ConfigLoader';

async function enablePaymentFlags() {
    const configLoader = ConfigLoader.getInstance();
    const dbConfig = configLoader.get('database.postgres');

    const client = new Client({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.database,
        ssl: dbConfig.ssl
    });

    try {
        await client.connect();

        const flags = [
            { key: 'paymentStripe', description: 'Stripe Payment Gateway: Enable payments via Stripe', is_enabled: true },
            { key: 'paymentLemonSqueezy', description: 'Lemon Squeezy Payment Gateway: Enable payments via Lemon Squeezy', is_enabled: true },
            { key: 'paymentTwoCheckout', description: '2Checkout Payment Gateway: Enable payments via 2Checkout', is_enabled: true }
        ];

        for (const flag of flags) {
            await client.query(`
                INSERT INTO feature_flags (key, description, is_enabled)
                VALUES ($1, $2, $3)
                ON CONFLICT (key) DO UPDATE SET
                    description = EXCLUDED.description,
                    is_enabled = EXCLUDED.is_enabled;
            `, [flag.key, flag.description, flag.is_enabled]);
            console.log(`Enabled: ${flag.key}`);
        }

        console.log('Payment gateway feature flags enabled successfully!');
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

enablePaymentFlags();