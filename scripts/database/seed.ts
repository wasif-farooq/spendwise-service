import { Client } from 'pg';
import { ConfigLoader } from '@config/ConfigLoader';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

interface Plan {
    id: string;
    name: string;
}

const PASSWORD = 'Test@123';
const HASHED_PASSWORD = '$2a$10$rVqKxLVLKoK.vYj.7JZ9LuJ7LXJ.p9TjK.X.vYj.7JZ9LuJ7LXJ.p9Tj'; // Test@123 pre-hashed

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
    'Electric Company', 'Water Utility', 'Gas Company', 'Internet Provider',
    'Gym Membership', 'Planet Fitness', 'LA Fitness',
    'Doctor Visit', 'Dental Care', 'Vision Center'
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

function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function seed() {
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

        // Get subscription plans
        console.log('Fetching subscription plans...');
        const plansResult = await client.query('SELECT id, name FROM subscription_plans WHERE is_active = true');
        const plans: Plan[] = plansResult.rows;

        if (plans.length === 0) {
            console.error('No subscription plans found. Run the seed first to create plans.');
            process.exit(1);
        }

        const planMap = new Map(plans.map(p => [p.name, p.id]));
        const planDistribution = [
            { name: 'Free', count: 3 },
            { name: 'Starter', count: 2 },
            { name: 'Pro', count: 3 },
            { name: 'Business', count: 2 },
        ];

        // Clear existing test data
        console.log('Clearing existing test data...');
        await client.query('DELETE FROM transactions WHERE user_id IN (SELECT id FROM users WHERE email LIKE \'seed_%@test.com\')');
        await client.query('DELETE FROM attachments WHERE user_id IN (SELECT id FROM users WHERE email LIKE \'seed_%@test.com\')');
        await client.query('DELETE FROM workspace_invitations WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email LIKE \'seed_%@test.com\'))');
        await client.query('DELETE FROM workspace_member_account_permissions WHERE member_id IN (SELECT id FROM workspace_members WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email LIKE \'seed_%@test.com\')))');
        await client.query('DELETE FROM workspace_members WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email LIKE \'seed_%@test.com\'))');
        await client.query('DELETE FROM workspace_roles WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email LIKE \'seed_%@test.com\'))');
        await client.query('DELETE FROM categories WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email LIKE \'seed_%@test.com\'))');
        await client.query('DELETE FROM accounts WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email LIKE \'seed_%@test.com\'))');
        await client.query('DELETE FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email LIKE \'seed_%@test.com\')');
        await client.query('DELETE FROM user_preferences WHERE user_id IN (SELECT id FROM users WHERE email LIKE \'seed_%@test.com\')');
        await client.query('DELETE FROM user_subscriptions WHERE user_id IN (SELECT id FROM users WHERE email LIKE \'seed_%@test.com\')');
        await client.query('DELETE FROM auth_identities WHERE user_id IN (SELECT id FROM users WHERE email LIKE \'seed_%@test.com\')');
        await client.query('DELETE FROM users WHERE email LIKE \'seed_%@test.com\'');

        console.log('Creating users with subscriptions...');

        const firstNames = ['John', 'Jane', 'Mike', 'Sarah', 'David', 'Emily', 'Chris', 'Lisa', 'Tom', 'Amy'];
        const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Taylor'];
        
        let userIndex = 0;
        const users: { id: string; email: string }[] = [];

        for (const dist of planDistribution) {
            const planId = planMap.get(dist.name);
            if (!planId) continue;

            for (let i = 0; i < dist.count; i++) {
                const firstName = firstNames[userIndex];
                const lastName = lastNames[userIndex];
                const email = `seed_${firstName.toLowerCase()}${userIndex}@test.com`;
                const userId = uuidv4();

                // Create user
                await client.query(`
                    INSERT INTO users (id, email, first_name, last_name, role, status, is_active, created_at, updated_at, email_verified)
                    VALUES ($1, $2, $3, $4, 'pro', 'active', true, NOW(), NOW(), true)
                `, [userId, email, firstName, lastName]);

                // Create auth identity (password)
                const passwordHash = await bcrypt.hash(PASSWORD, 10);
                await client.query(`
                    INSERT INTO auth_identities (id, user_id, provider, password_hash, created_at)
                    VALUES ($1, $2, 'local', $3, NOW())
                `, [uuidv4(), userId, passwordHash]);

                // Create subscription
                const periodStart = new Date();
                const periodEnd = new Date();
                periodEnd.setMonth(periodEnd.getMonth() + 12);

                await client.query(`
                    INSERT INTO user_subscriptions (id, user_id, plan_id, status, billing_cycle, current_period_start, current_period_end, start_date, end_date, created_at, updated_at)
                    VALUES ($1, $2, $3, 'active', 'monthly', $4, $5, $4, $5, NOW(), NOW())
                `, [uuidv4(), userId, planId, periodStart, periodEnd]);

                // Create user preferences
                await client.query(`
                    INSERT INTO user_preferences (id, user_id, currency, language, timezone, created_at, updated_at)
                    VALUES ($1, $2, 'USD', 'en', 'UTC', NOW(), NOW())
                `, [uuidv4(), userId]);

                users.push({ id: userId, email });
                console.log(`  Created user: ${email} (${dist.name} plan)`);
                userIndex++;
            }
        }

        console.log(`\nCreating workspaces, roles, members, categories, accounts, and transactions...`);

        const workspaceNames = [
            ['Personal', 'Family'],
            ['Business', 'Side Hustle'],
            ['Personal', 'Business', 'Investing'],
            ['Family', 'Household'],
            ['Work', 'Personal'],
        ];

        let totalTransactions = 0;

        for (const user of users) {
            const workspaceCount = Math.floor(Math.random() * 2) + 2; // 2-3 workspaces
            const names = workspaceNames[userIndex % workspaceNames.length] || ['Personal'];

            for (let w = 0; w < workspaceCount; w++) {
                const workspaceId = uuidv4();
                const workspaceName = names[w] || `Workspace ${w + 1}`;
                const slug = slugify(`${workspaceName}-${user.email.split('@')[0]}-${Date.now()}`);

                // Create workspace
                await client.query(`
                    INSERT INTO workspaces (id, name, slug, owner_id, currency, language, timezone, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, 'USD', 'en', 'UTC', NOW(), NOW())
                `, [workspaceId, workspaceName, slug, user.id]);

                // Create 2 roles + Owner system role
                const adminRoleId = uuidv4();
                const viewerRoleId = uuidv4();
                const ownerRoleId = uuidv4();

                // Create Owner system role first
                await client.query(`
                    INSERT INTO workspace_roles (id, workspace_id, name, description, permissions, is_default, is_system, created_at, updated_at)
                    VALUES ($1, $2, 'Owner', 'Workspace owner with full access', ARRAY['*'], true, true, NOW(), NOW())
                `, [ownerRoleId, workspaceId]);

                await client.query(`
                    INSERT INTO workspace_roles (id, workspace_id, name, description, permissions, is_default, is_system, created_at, updated_at)
                    VALUES ($1, $2, 'Admin', 'Full access to all features', ARRAY['*'], false, false, NOW(), NOW())
                `, [adminRoleId, workspaceId]);

                await client.query(`
                    INSERT INTO workspace_roles (id, workspace_id, name, description, permissions, is_default, is_system, created_at, updated_at)
                    VALUES ($1, $2, 'Viewer', 'Read-only access', ARRAY['read'], false, false, NOW(), NOW())
                `, [viewerRoleId, workspaceId]);

                // Create additional role if Pro/Business
                const planResult = await client.query(`
                    SELECT sp.name FROM user_subscriptions us
                    JOIN subscription_plans sp ON us.plan_id = sp.id
                    WHERE us.user_id = $1
                `, [user.id]);
                
                if (planResult.rows[0]?.name === 'Pro' || planResult.rows[0]?.name === 'Business') {
                    const editorRoleId = uuidv4();
                    await client.query(`
                        INSERT INTO workspace_roles (id, workspace_id, name, description, permissions, is_default, is_system, created_at, updated_at)
                        VALUES ($1, $2, 'Editor', 'Can edit transactions', ARRAY['read', 'write', 'transactions'], false, false, NOW(), NOW())
                    `, [editorRoleId, workspaceId]);
                }

                // Create owner member and assign to Owner role
                const ownerMemberId = uuidv4();
                await client.query(`
                    INSERT INTO workspace_members (id, workspace_id, user_id, role_id, role_ids, status, joined_at, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW(), NOW())
                `, [ownerMemberId, workspaceId, user.id, ownerRoleId, [ownerRoleId]]);

                // Create categories
                const categoryIds: { income: string[]; expense: string[] } = { income: [], expense: [] };
                
                for (const cat of EXPENSE_CATEGORIES) {
                    const catId = uuidv4();
                    await client.query(`
                        INSERT INTO categories (id, workspace_id, name, type, icon, color, is_income, is_system, created_at, updated_at)
                        VALUES ($1, $2, $3, 'expense', $4, $5, false, false, NOW(), NOW())
                    `, [catId, workspaceId, cat.name, cat.icon, cat.color]);
                    categoryIds.expense.push(catId);
                }

                for (const cat of INCOME_CATEGORIES) {
                    const catId = uuidv4();
                    await client.query(`
                        INSERT INTO categories (id, workspace_id, name, type, icon, color, is_income, is_system, created_at, updated_at)
                        VALUES ($1, $2, $3, 'income', $4, $5, true, false, NOW(), NOW())
                    `, [catId, workspaceId, cat.name, cat.icon, cat.color]);
                    categoryIds.income.push(catId);
                }

                // Create 2-3 accounts
                const accountCount = Math.floor(Math.random() * 2) + 2; // 2-3 accounts
                const accounts: { id: string; type: string }[] = [];

                for (let a = 0; a < accountCount; a++) {
                    const accountId = uuidv4();
                    const accountType = ACCOUNT_TYPES[a % ACCOUNT_TYPES.length];
                    const balance = randomAmount(100, 50000);
                    const color = randomElement(ACCOUNT_COLORS);

                    await client.query(`
                        INSERT INTO accounts (id, workspace_id, user_id, name, type, balance, currency, color, is_active, is_on_budget, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, $5, $6, 'USD', $7, true, true, NOW(), NOW())
                    `, [accountId, workspaceId, user.id, `${workspaceName} ${accountType.charAt(0).toUpperCase() + accountType.slice(1)}`, accountType, balance, color]);

                    accounts.push({ id: accountId, type: accountType });

                    // Create transactions for this account (13 months of data)
                    const transactionCount = Math.floor(Math.random() * 50) + 100; // 100-150 transactions per account
                    
                    const startDate = new Date();
                    startDate.setFullYear(startDate.getFullYear() - 1);
                    const endDate = new Date();

                    for (let t = 0; t < transactionCount; t++) {
                        const isIncome = Math.random() < 0.4; // 40% income
                        const type = isIncome ? 'income' : 'expense';
                        const categoryId = isIncome 
                            ? randomElement(categoryIds.income) 
                            : randomElement(categoryIds.expense);
                        const amount = isIncome 
                            ? randomAmount(500, 10000) // Income: $500-$10k
                            : randomAmount(10, 500);   // Expense: $10-$500
                        
                        const date = randomDate(startDate, endDate);
                        const merchant = randomElement(MERCHANTS);
                        const hasNotes = Math.random() < 0.3;
                        const notes = hasNotes ? `Monthly ${merchant.toLowerCase()} expense` : null;

                        await client.query(`
                            INSERT INTO transactions (id, workspace_id, account_id, category_id, user_id, type, amount, currency, description, date, merchant, notes, created_at, updated_at)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, 'USD', $8, $9, $10, $11, NOW(), NOW())
                        `, [
                            uuidv4(), workspaceId, accountId, categoryId, user.id, 
                            type, amount, `${merchant} transaction`, date, merchant, notes
                        ]);
                        
                        totalTransactions++;
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

                // Create 1-2 invitations
                if (Math.random() < 0.7) {
                    const inviteCount = Math.floor(Math.random() * 2) + 1;
                    for (let inv = 0; inv < inviteCount; inv++) {
                        const inviteEmail = `invite_${w}_${inv}_${user.email.split('@')[0]}@example.com`;
                        const token = uuidv4();
                        const expiresAt = new Date();
                        expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days
                        
                        await client.query(`
                            INSERT INTO workspace_invitations (id, workspace_id, role_id, invited_by, email, status, token, expires_at, created_at, updated_at)
                            VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, NOW(), NOW())
                        `, [uuidv4(), workspaceId, viewerRoleId, user.id, inviteEmail, token, expiresAt]);
                    }
                }

                console.log(`  Created workspace: ${workspaceName} with ${accounts.length} accounts, ~${accounts.length * 120} transactions`);
            }
            userIndex++;
        }

        // Create attachments for some transactions
        console.log('\nCreating attachments...');
        
        const transactionsResult = await client.query(`
            SELECT t.id, t.user_id, t.workspace_id FROM transactions t
            JOIN users u ON t.user_id = u.id
            WHERE u.email LIKE 'seed_%@test.com'
            ORDER BY RANDOM()
            LIMIT 50
        `);

        for (const row of transactionsResult.rows) {
            await client.query(`
                INSERT INTO attachments (id, user_id, workspace_id, transaction_id, filename, mime_type, size, created_at)
                VALUES ($1, $2, $3, $4, $5, 'image/jpeg', $6, NOW())
            `, [uuidv4(), row.user_id, row.workspace_id, row.id, `receipt_${row.id.slice(0, 8)}.jpg`, Math.floor(Math.random() * 500000) + 10000]);
        }

        console.log(`  Created ${transactionsResult.rows.length} attachments`);

        // Summary
        console.log('\n========================================');
        console.log('SEEDING COMPLETE');
        console.log('========================================');
        console.log(`Users created: ${users.length}`);
        console.log(`Transactions created: ${totalTransactions}`);
        console.log(`Attachments created: ${transactionsResult.rows.length}`);
        console.log('\nTest Users (Password: Test@123):');
        users.forEach((u, i) => console.log(`  ${i + 1}. ${u.email}`));
        console.log('========================================');

    } catch (err) {
        console.error('Seeding error:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

seed();