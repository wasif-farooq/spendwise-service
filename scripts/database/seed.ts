import { Client } from 'pg';
import { ConfigLoader } from '@config/ConfigLoader';

async function seed() {
    // Load Config
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
        console.log('Connecting to database...');
        await client.connect();

        console.log('Seeding Feature Flags...');

        const flags = [
            // Core Features (from mock + web analysis)
            { key: 'ai_advisor', description: 'AI Budget Advisor: Enable the AI-powered personalized budget advisor', is_enabled: true },
            { key: 'crypto_tracking', description: 'Crypto Wallet Sync: Support for syncing crypto wallets through Plaid', is_enabled: false },
            { key: 'multicurrency', description: 'Multi-Currency Support: Allows users to maintain accounts in different currencies', is_enabled: true },
            { key: 'advanced_analytics', description: 'Predictive Analytics: Advanced spending prediction models', is_enabled: false }, // experimental
            { key: 'dark_mode', description: 'Dark Mode v2: New improved dark mode with higher contrast', is_enabled: false },
            { key: 'api_v2', description: 'API v2 Access: Grant access to the new REST API endpoints', is_enabled: false }, // experimental
            { key: 'audit_logs', description: 'Advanced Audit Logs: Detailed user activity tracking for enterprise accounts', is_enabled: true },
            { key: 'teamCollaboration', description: 'Team Collaboration features', is_enabled: true },
            { key: 'customReports', description: 'Custom Reporting capabilities', is_enabled: false },

            // Web Views & Navigation Features
            { key: 'accounts_view', description: 'Accounts Management: View and manage bank accounts', is_enabled: true },
            { key: 'transactions_view', description: 'Transactions: View and categorize transactions', is_enabled: true },
            { key: 'exchange_rates', description: 'Exchange Rates: View operational exchange rates', is_enabled: true },
            { key: 'manage_organization', description: 'Organization Management: Manage members and roles', is_enabled: true },
            { key: 'billing_management', description: 'Billing Management: View invoices and subscription details', is_enabled: true },
            { key: 'two_factor_auth', description: '2FA: Enable Two-Factor Authentication security', is_enabled: true }
        ];

        for (const flag of flags) {
            await client.query(`
                INSERT INTO feature_flags (key, description, is_enabled)
                VALUES ($1, $2, $3)
                ON CONFLICT (key) DO UPDATE SET 
                    description = EXCLUDED.description,
                    is_enabled = EXCLUDED.is_enabled;
            `, [flag.key, flag.description, flag.is_enabled]);
        }

        console.log('Feature Flags seeded successfully.');

        console.log('Seeding Subscription Plans...');

        // Delete existing plans and re-insert
        await client.query('DELETE FROM subscription_plans');

        const plans = [
            {
                name: 'Free',
                price: 0,
                currency: 'USD',
                billing_period: 'monthly',
                description: 'Perfect for getting started',
                features: ['accounts_view', 'transactions_view', 'exchange_rates'],
                limits: { accounts: 2, transactions_per_account: 100 },
                is_active: true
            },
            {
                name: 'Starter',
                price: 9.99,
                currency: 'USD',
                billing_period: 'monthly',
                description: 'For individuals who want more',
                features: ['accounts_view', 'transactions_view', 'exchange_rates', 'manage_organization'],
                limits: { accounts: 5, transactions_per_account: 500 },
                is_active: true
            },
            {
                name: 'Pro',
                price: 24.99,
                currency: 'USD',
                billing_period: 'monthly',
                description: 'For power users and small teams',
                features: ['accounts_view', 'transactions_view', 'exchange_rates', 'manage_organization', 'billing_management'],
                limits: { accounts: 10, transactions_per_account: 2000 },
                is_active: true
            },
            {
                name: 'Business',
                price: 49.99,
                currency: 'USD',
                billing_period: 'monthly',
                description: 'For growing businesses',
                features: ['accounts_view', 'transactions_view', 'exchange_rates', 'manage_organization', 'billing_management', 'audit_logs', 'two_factor_auth'],
                limits: { accounts: 25, transactions_per_account: -1 }, // -1 = unlimited
                is_active: true
            }
        ];

        for (const plan of plans) {
            // Use simple INSERT with generated UUID
            const id = require('uuid').v4();
            await client.query(`
                INSERT INTO subscription_plans (id, name, price, currency, billing_period, description, features, limits, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                id,
                plan.name,
                plan.price,
                plan.currency,
                plan.billing_period,
                plan.description,
                JSON.stringify(plan.features),
                JSON.stringify(plan.limits),
                plan.is_active
            ]);
        }

        console.log('Subscription Plans seeded successfully.');

    } catch (err) {
        console.error('Seeding error:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

seed();
