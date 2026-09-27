import { Client } from 'pg';
import { ConfigLoader } from '@config/ConfigLoader';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

interface Plan {
    id: string;
    name: string;
}

const EXPENSE_CATEGORIES = [
    { name: 'Food & Dining', icon: 'Utensils', color: '#f97316' },
    { name: 'Transport', icon: 'Car', color: '#3b82f6' },
    { name: 'Shopping', icon: 'ShoppingBag', color: '#8b5cf6' },
    { name: 'Housing', icon: 'Home', color: '#10b981' },
    { name: 'Utilities', icon: 'Zap', color: '#f59e0b' },
    { name: 'Health', icon: 'Heart', color: '#f43f5e' },
    { name: 'Entertainment', icon: 'Gamepad2', color: '#ec4899' },
    { name: 'Education', icon: 'GraduationCap', color: '#6366f1' },
    { name: 'Travel', icon: 'Plane', color: '#0ea5e9' },
    { name: 'Groceries', icon: 'ShoppingCart', color: '#22c55e' },
    { name: 'Insurance', icon: 'Shield', color: '#64748b' },
    { name: 'Personal Care', icon: 'Sparkles', color: '#f472b6' },
    { name: 'Other Expense', icon: 'MoreHorizontal', color: '#6b7280' },
];

const INCOME_CATEGORIES = [
    { name: 'Salary', icon: 'Briefcase', color: '#10b981' },
    { name: 'Freelance', icon: 'Laptop', color: '#3b82f6' },
    { name: 'Investment', icon: 'TrendingUp', color: '#8b5cf6' },
    { name: 'Gift', icon: 'Gift', color: '#f97316' },
    { name: 'Refund', icon: 'RotateCcw', color: '#06b6d4' },
    { name: 'Other Income', icon: 'MoreHorizontal', color: '#6b7280' },
];

const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'cash', 'investment'];
const ACCOUNT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4'];
const MERCHANTS = [
    'Amazon', 'Walmart', 'Target', 'Costco', 'Whole Foods', 'Trader Joes',
    'Shell Gas Station', 'Chevron', 'BP', 'ExxonMobil',
    'Netflix', 'Spotify', 'Apple', 'Google', 'Microsoft',
    'Starbucks', 'McDonalds', 'Subway', 'Chipotle', 'Panera Bread',
    'CVS Pharmacy', 'Walgreens', 'Home Depot', 'Lowe\'s', 'Best Buy',
];

function randomDate(start: Date, end: Date): Date {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomAmount(min: number, max: number): number {
    return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomElement<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

async function seedTestUser() {
    const configLoader = ConfigLoader.getInstance();
    const dbConfig = configLoader.get('database.postgres');

    const client = new Client({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.database,
        ssl: dbConfig.ssl,
    });

    try {
        console.log('Connecting to database...');
        await client.connect();

        const email = 'test@example.com';
        const password = 'TestPassword123!';
        const userId = uuidv4();

        // Clean up any existing test user data first
        const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            console.log(`User ${email} already exists, cleaning up...`);
            const existingId = existing.rows[0].id;
            await client.query('DELETE FROM transactions WHERE user_id = $1', [existingId]);
            await client.query('DELETE FROM attachments WHERE user_id = $1', [existingId]);
            await client.query('DELETE FROM workspace_member_account_permissions WHERE member_id IN (SELECT id FROM workspace_members WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = $1))', [existingId]);
            await client.query('DELETE FROM workspace_invitations WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = $1)', [existingId]);
            await client.query('DELETE FROM workspace_members WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = $1)', [existingId]);
            await client.query('DELETE FROM workspace_roles WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = $1)', [existingId]);
            await client.query('DELETE FROM categories WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = $1)', [existingId]);
            await client.query('DELETE FROM accounts WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = $1)', [existingId]);
            await client.query('DELETE FROM workspaces WHERE owner_id = $1', [existingId]);
            await client.query('DELETE FROM user_preferences WHERE user_id = $1', [existingId]);
            await client.query('DELETE FROM user_subscriptions WHERE user_id = $1', [existingId]);
            await client.query('DELETE FROM auth_identities WHERE user_id = $1', [existingId]);
            await client.query('DELETE FROM users WHERE id = $1', [existingId]);
            console.log('Cleaned up existing data.');
        }

        // Get a subscription plan
        const plansResult = await client.query(
            'SELECT id, name FROM subscription_plans WHERE is_active = true ORDER BY name ASC'
        );
        // Try to get Pro plan first, fall back to any plan
        let plan = plansResult.rows.find((p: any) => p.name === 'Pro');
        if (!plan && plansResult.rows.length > 0) {
            plan = plansResult.rows[0];
        }
        if (!plan) {
            console.error('No subscription plans found. Run the main seed first.');
            process.exit(1);
        }

        console.log('Creating test user...');

        // Create user
        await client.query(
            `INSERT INTO users (id, email, first_name, last_name, role, status, is_active, created_at, updated_at, email_verified)
             VALUES ($1, $2, $3, $4, 'pro', 'active', true, NOW(), NOW(), true)`,
            [userId, email, 'Test', 'User']
        );

        // Create auth identity
        const passwordHash = await bcrypt.hash(password, 10);
        await client.query(
            `INSERT INTO auth_identities (id, user_id, provider, password_hash, created_at)
             VALUES ($1, $2, 'local', $3, NOW())`,
            [uuidv4(), userId, passwordHash]
        );

        // Create subscription
        const now = new Date();
        const yearLater = new Date();
        yearLater.setFullYear(yearLater.getFullYear() + 1);
        await client.query(
            `INSERT INTO user_subscriptions (id, user_id, plan_id, status, billing_cycle, current_period_start, current_period_end, start_date, end_date, limits_snapshot, created_at, updated_at)
             VALUES ($1, $2, $3, 'active', 'monthly', $4, $5, $4, $5, $6, NOW(), NOW())`,
            [uuidv4(), userId, plan.id, now, yearLater, JSON.stringify({
                accounts: -1,
                members: -1,
                workspaces: -1,
                customRoles: -1,
                categoriesPerWorkspace: -1,
                transactionHistoryMonths: -1,
                analyticsHistoryDays: -1,
                hasAIAdvisor: true,
                hasExchangeRates: true,
                hasPermissionOverrides: true,
            })]
        );

        // Create user preferences
        await client.query(
            `INSERT INTO user_preferences (id, user_id, currency, language, timezone, created_at, updated_at)
             VALUES ($1, $2, 'USD', 'en', 'UTC', NOW(), NOW())`,
            [uuidv4(), userId]
        );

        // Create workspace
        const workspaceId = uuidv4();
        await client.query(
            `INSERT INTO workspaces (id, name, slug, owner_id, currency, language, timezone, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'USD', 'en', 'UTC', NOW(), NOW())`,
            [workspaceId, 'Personal', 'personal-test-user', userId]
        );

        // Create workspace roles
        const ownerRoleId = uuidv4();
        await client.query(
            `INSERT INTO workspace_roles (id, workspace_id, name, description, permissions, is_default, is_system, created_at, updated_at)
             VALUES ($1, $2, 'Owner', 'Workspace owner with full access', ARRAY['*'], true, true, NOW(), NOW())`,
            [ownerRoleId, workspaceId]
        );

        // Add owner as workspace member
        await client.query(
            `INSERT INTO workspace_members (id, workspace_id, user_id, role_id, role_ids, status, joined_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW(), NOW())`,
            [uuidv4(), workspaceId, userId, ownerRoleId, [ownerRoleId]]
        );

        // Create categories
        const categoryIds: { income: string[]; expense: string[] } = { income: [], expense: [] };

        for (const cat of EXPENSE_CATEGORIES) {
            const catId = uuidv4();
            await client.query(
                `INSERT INTO categories (id, workspace_id, name, type, icon, color, is_income, is_system, created_at, updated_at)
                 VALUES ($1, $2, $3, 'expense', $4, $5, false, false, NOW(), NOW())`,
                [catId, workspaceId, cat.name, cat.icon, cat.color]
            );
            categoryIds.expense.push(catId);
        }

        for (const cat of INCOME_CATEGORIES) {
            const catId = uuidv4();
            await client.query(
                `INSERT INTO categories (id, workspace_id, name, type, icon, color, is_income, is_system, created_at, updated_at)
                 VALUES ($1, $2, $3, 'income', $4, $5, true, false, NOW(), NOW())`,
                [catId, workspaceId, cat.name, cat.icon, cat.color]
            );
            categoryIds.income.push(catId);
        }

        // Create 2 accounts
        const accountTypes = ['checking', 'savings'];
        const accountNames = ['Main Checking', 'Savings'];
        const accountBalances = [5420.75, 12800.00];
        const accounts: { id: string }[] = [];

        for (let i = 0; i < 2; i++) {
            const accountId = uuidv4();
            await client.query(
                `INSERT INTO accounts (id, workspace_id, user_id, name, type, balance, currency, color, is_active, is_on_budget, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, 'USD', $7, true, true, NOW(), NOW())`,
                [accountId, workspaceId, userId, accountNames[i], accountTypes[i], accountBalances[i], ACCOUNT_COLORS[i]]
            );
            accounts.push({ id: accountId });

            // Create transactions for this account (last 3 months)
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 3);
            const endDate = new Date();
            const transactionCount = 30;

            for (let t = 0; t < transactionCount; t++) {
                const isIncome = Math.random() < 0.3;
                const type = isIncome ? 'income' : 'expense';
                const categoryId = isIncome
                    ? randomElement(categoryIds.income)
                    : randomElement(categoryIds.expense);
                const amount = isIncome
                    ? randomAmount(1000, 5000)
                    : randomAmount(10, 300);
                const date = randomDate(startDate, endDate);
                const merchant = randomElement(MERCHANTS);

                await client.query(
                    `INSERT INTO transactions (id, workspace_id, account_id, category_id, user_id, type, amount, currency, description, date, merchant, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, 'USD', $8, $9, $10, NOW(), NOW())`,
                    [uuidv4(), workspaceId, accountId, categoryId, userId,
                     type, amount, `${merchant} transaction`, date, merchant]
                );
            }

            // Update account totals
            await client.query(`
                UPDATE accounts SET
                    total_income = (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE account_id = $1 AND type = 'income'),
                    total_expense = (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE account_id = $1 AND type = 'expense'),
                    last_activity = (SELECT MAX(date) FROM transactions WHERE account_id = $1)
                WHERE id = $1
            `, [accountId]);
        }

        console.log(`✓ Created user: ${email} / ${password}`);
        console.log(`✓ Created workspace: Personal`);
        console.log(`✓ Created ${accounts.length} accounts with transactions`);
        console.log('✓ Test user seeded successfully!');

    } catch (err) {
        console.error('Seeding error:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

seedTestUser();
