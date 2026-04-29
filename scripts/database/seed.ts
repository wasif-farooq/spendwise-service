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
            { name: 'ai_advisor', description: 'AI Budget Advisor: Enable the AI-powered personalized budget advisor', enabled: true },
            { name: 'crypto_tracking', description: 'Crypto Wallet Sync: Support for syncing crypto wallets through Plaid', enabled: false },
            { name: 'multicurrency', description: 'Multi-Currency Support: Allows users to maintain accounts in different currencies', enabled: true },
            { name: 'advanced_analytics', description: 'Predictive Analytics: Advanced spending prediction models', enabled: false },
            { name: 'dark_mode', description: 'Dark Mode v2: New improved dark mode with higher contrast', enabled: false },
            { name: 'api_v2', description: 'API v2 Access: Grant access to the new REST API endpoints', enabled: false },
            { name: 'audit_logs', description: 'Advanced Audit Logs: Detailed user activity tracking for enterprise accounts', enabled: true },
            { name: 'teamCollaboration', description: 'Team Collaboration features', enabled: true },
            { name: 'customReports', description: 'Custom Reporting capabilities', enabled: false },
            { name: 'accounts_view', description: 'Accounts Management: View and manage bank accounts', enabled: true },
            { name: 'transactions_view', description: 'Transactions: View and categorize transactions', enabled: true },
            { name: 'exchange_rates', description: 'Exchange Rates: View operational exchange rates', enabled: true },
            { name: 'manage_workspace', description: 'Workspace Management: Manage members and roles', enabled: true },
            { name: 'billing_management', description: 'Billing Management: View invoices and subscription details', enabled: true },
            { name: 'two_factor_auth', description: '2FA: Enable Two-Factor Authentication security', enabled: true }
        ];

        for (const flag of flags) {
            await client.query(`
                INSERT INTO feature_flags (name, description, enabled)
                VALUES ($1, $2, $3)
                ON CONFLICT (name) DO UPDATE SET 
                    description = EXCLUDED.description,
                    enabled = EXCLUDED.enabled;
            `, [flag.name, flag.description, flag.enabled]);
        }

        console.log('Feature Flags seeded successfully.');

        console.log('Seeding Subscription Plans...');

        // Delete existing plans and re-insert
        await client.query('DELETE FROM subscription_plans');

        const plans = [
            {
                name: 'Free',
                price_monthly: 0,
                price_yearly: 0,
                currency: 'USD',
                description: 'Perfect for getting started',
                features: [
                    { name: 'Accounts', description: 'Number of accounts you can create', included: true, limit: '2 accounts' },
                    { name: 'Transactions', description: 'Transactions per account per month', included: true, limit: '100 transactions' },
                    { name: 'Basic Analytics', description: 'View spending patterns', included: true },
                    { name: 'Team Members', description: 'Invite team members', included: true, limit: '2 members' },
                    { name: 'Custom Roles', description: 'Create custom roles (Owner + 1)', included: true, limit: '2 roles' }
                ],
                limits: {
                    accounts: 2,
                    transactionsPerAccount: 100,
                    members: 2,
                    workspaces: 1,
                    customRoles: 2,
                    hasExchangeRates: false,
                    hasPermissionOverrides: false,
                    hasAIAdvisor: false,
                    hasExportData: false,
                    hasPrioritySupport: false,
                    hasAPIAccess: false,
                    transactionHistoryMonths: 3,
                    analyticsHistoryDays: 30
                },
                is_active: true,
                is_featured: false
            },
            {
                name: 'Starter',
                price_monthly: 9,
                price_yearly: 86,
                currency: 'USD',
                description: 'For individuals who want more',
                features: [
                    { name: 'Accounts', description: 'Number of accounts you can create', included: true, limit: '5 accounts' },
                    { name: 'Transactions', description: 'Transactions per account per month', included: true, limit: '500 transactions' },
                    { name: 'Advanced Analytics', description: 'Detailed spending insights', included: true },
                    { name: 'Team Members', description: 'Invite team members', included: true, limit: '5 members' },
                    { name: 'Custom Roles', description: 'Create custom roles', included: true, limit: '5 roles' },
                    { name: 'Exchange Rates', description: 'Real-time currency exchange', included: true }
                ],
                limits: {
                    accounts: 5,
                    transactionsPerAccount: 500,
                    members: 5,
                    workspaces: 2,
                    customRoles: 5,
                    hasExchangeRates: true,
                    hasPermissionOverrides: false,
                    hasAIAdvisor: false,
                    hasExportData: false,
                    hasPrioritySupport: false,
                    hasAPIAccess: false,
                    transactionHistoryMonths: 6,
                    analyticsHistoryDays: 90
                },
                is_active: true,
                is_featured: false
            },
            {
                name: 'Pro',
                price_monthly: 19,
                price_yearly: 182,
                currency: 'USD',
                description: 'For power users and small teams',
                features: [
                    { name: 'Accounts', description: 'Number of accounts you can create', included: true, limit: '10 accounts' },
                    { name: 'Transactions', description: 'Transactions per account per month', included: true, limit: '2,000 transactions' },
                    { name: 'Advanced Analytics', description: 'Detailed spending insights', included: true },
                    { name: 'Team Members', description: 'Invite team members', included: true, limit: '10 members' },
                    { name: 'Custom Roles', description: 'Create custom roles', included: true, limit: '10 roles' },
                    { name: 'Exchange Rates', description: 'Real-time currency exchange', included: true },
                    { name: 'AI Advisor', description: 'AI-powered financial insights', included: true },
                    { name: 'Export Data', description: 'Export to CSV/Excel', included: true },
                    { name: 'Permission Overrides', description: 'Per-account permission settings', included: true },
                    { name: 'Priority Support', description: 'Get help faster', included: true }
                ],
                limits: {
                    accounts: 10,
                    transactionsPerAccount: 2000,
                    members: 10,
                    workspaces: 5,
                    customRoles: 10,
                    hasExchangeRates: true,
                    hasPermissionOverrides: true,
                    hasAIAdvisor: true,
                    hasExportData: true,
                    hasPrioritySupport: true,
                    hasAPIAccess: false,
                    transactionHistoryMonths: 12,
                    analyticsHistoryDays: 180
                },
                is_active: true,
                is_featured: true
            },
            {
                name: 'Business',
                price_monthly: 49,
                price_yearly: 470,
                currency: 'USD',
                description: 'For growing businesses',
                features: [
                    { name: 'Accounts', description: 'Number of accounts you can create', included: true, limit: '25 accounts' },
                    { name: 'Transactions', description: 'Transactions per account per month', included: true, limit: 'Unlimited' },
                    { name: 'Advanced Analytics', description: 'Detailed spending insights', included: true },
                    { name: 'Team Members', description: 'Invite team members', included: true, limit: 'Unlimited' },
                    { name: 'Custom Roles', description: 'Create custom roles', included: true, limit: 'Unlimited' },
                    { name: 'Exchange Rates', description: 'Real-time currency exchange', included: true },
                    { name: 'AI Advisor', description: 'AI-powered financial insights', included: true },
                    { name: 'Export Data', description: 'Export to CSV/Excel', included: true },
                    { name: 'Permission Overrides', description: 'Per-account permission settings', included: true },
                    { name: 'Priority Support', description: '24/7 dedicated support', included: true },
                    { name: 'API Access', description: 'Access to developer API', included: true }
                ],
                limits: {
                    accounts: 25,
                    transactionsPerAccount: -1,
                    members: -1,
                    workspaces: -1,
                    customRoles: -1,
                    hasExchangeRates: true,
                    hasPermissionOverrides: true,
                    hasAIAdvisor: true,
                    hasExportData: true,
                    hasPrioritySupport: true,
                    hasAPIAccess: true,
                    transactionHistoryMonths: -1,
                    analyticsHistoryDays: -1
                },
                is_active: true,
                is_featured: false
            }
        ];

        for (const plan of plans) {
            const id = require('uuid').v4();
            await client.query(`
                INSERT INTO subscription_plans (id, name, price_monthly, price_yearly, currency, description, features, limits, is_active, is_featured)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                id,
                plan.name,
                plan.price_monthly,
                plan.price_yearly,
                plan.currency,
                plan.description,
                JSON.stringify(plan.features),
                JSON.stringify(plan.limits),
                plan.is_active,
                plan.is_featured
            ]);
        }

        console.log('Subscription Plans seeded successfully.');

        console.log('Subscription Plans seeded successfully.');

        // Seed Categories
        console.log('Seeding Categories...');
        
        // Get workspace IDs to associate categories with
        const workspacesResult = await client.query('SELECT id FROM workspaces LIMIT 5');
        const workspaceIds = workspacesResult.rows.map(r => r.id);
        
        if (workspaceIds.length > 0) {
            const categories = [
                // Expense Categories
                { name: 'Food & Dining', type: 'expense', icon: 'Utensils', color: '#f97316' },
                { name: 'Transport', type: 'expense', icon: 'Car', color: '#3b82f6' },
                { name: 'Shopping', type: 'expense', icon: 'ShoppingBag', color: '#8b5cf6' },
                { name: 'Housing', type: 'expense', icon: 'Home', color: '#10b981' },
                { name: 'Utilities', type: 'expense', icon: 'Zap', color: '#f59e0b' },
                { name: 'Health', type: 'expense', icon: 'Heart', color: '#f43f5e' },
                { name: 'Entertainment', type: 'expense', icon: 'Gamepad2', color: '#ec4899' },
                { name: 'Education', type: 'expense', icon: 'GraduationCap', color: '#6366f1' },
                { name: 'Travel', type: 'expense', icon: 'Plane', color: '#0ea5e9' },
                { name: 'Groceries', type: 'expense', icon: 'ShoppingCart', color: '#22c55e' },
                { name: 'Insurance', type: 'expense', icon: 'Shield', color: '#64748b' },
                { name: 'Personal Care', type: 'expense', icon: 'Sparkles', color: '#f472b6' },
                { name: 'Other Expense', type: 'expense', icon: 'MoreHorizontal', color: '#6b7280' },
                
                // Income Categories
                { name: 'Salary', type: 'income', icon: 'Briefcase', color: '#10b981' },
                { name: 'Freelance', type: 'income', icon: 'Laptop', color: '#3b82f6' },
                { name: 'Investment', type: 'income', icon: 'TrendingUp', color: '#8b5cf6' },
                { name: 'Gift', type: 'income', icon: 'Gift', color: '#f97316' },
                { name: 'Refund', type: 'income', icon: 'RotateCcw', color: '#06b6d4' },
                { name: 'Other Income', type: 'income', icon: 'MoreHorizontal', color: '#6b7280' },
            ];

            for (const cat of categories) {
                for (const workspaceId of workspaceIds) {
                    // Check if category already exists
                    const existing = await client.query(
                        'SELECT id FROM categories WHERE workspace_id = $1 AND name = $2',
                        [workspaceId, cat.name]
                    );
                    
                    if (existing.rows.length === 0) {
                        await client.query(`
                            INSERT INTO categories (id, name, type, icon, color, workspace_id, created_at, updated_at)
                            VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                        `, [
                            require('uuid').v4(),
                            cat.name,
                            cat.type,
                            cat.icon,
                            cat.color,
                            workspaceId
                        ]);
                    }
                }
            }
            
            console.log(`Categories seeded successfully for ${workspaceIds.length} workspace(s).`);
        } else {
            console.log('No workspaces found, skipping category seeding.');
        }

    } catch (err) {
        console.error('Seeding error:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

seed();
