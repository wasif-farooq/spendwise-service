import { beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { Client } from 'pg';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

const TEST_DB_NAME = 'test_antigravity';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
jest.mock('../src/messaging/implementations/kafka/KafkaRequestReply', () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    KafkaRequestReply: jest.fn().mockImplementation(() => ({
        connect: jest.fn<any, any>().mockResolvedValue(undefined),
        request: jest.fn<any, any>().mockResolvedValue({}),
        disconnect: jest.fn<any, any>().mockResolvedValue(undefined)
    }))
}));

import { ServiceBootstrap } from '@bootstrap/ServiceBootstrap';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

let adminClient: Client | null = null;
let testClient: Client | null = null;

async function getAdminClient(): Promise<Client> {
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '5432');
    const user = process.env.DB_USER || 'antigravity';
    const password = process.env.DB_PASSWORD || 'password';

    const client = new Client({
        host,
        port,
        user,
        password,
        database: 'postgres'
    });
    await client.connect();
    return client;
}

async function getTestClient(): Promise<Client> {
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '5432');
    const user = process.env.DB_USER || 'antigravity';
    const password = process.env.DB_PASSWORD || 'password';

    const client = new Client({
        host,
        port,
        user,
        password,
        database: TEST_DB_NAME
    });
    await client.connect();
    return client;
}

async function runMigrations(): Promise<void> {
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '5432');
    const user = process.env.DB_USER || 'antigravity';
    const password = process.env.DB_PASSWORD || 'password';

    process.env.DB_NAME = TEST_DB_NAME;

    const migrateCmd = `npx node-pg-migrate up -d "postgres://${user}:${password}@${host}:${port}/${TEST_DB_NAME}"`;

    try {
        await execAsync(migrateCmd, { cwd: process.cwd() });
        console.log('Migrations completed');
    } catch (error) {
        console.error('Migration error:', error);
        throw error;
    }
}

async function runSeed(): Promise<void> {
    try {
        const seedScript = path.join(process.cwd(), 'scripts/database/seed.ts');
        if (fs.existsSync(seedScript)) {
            await execAsync(`npx ts-node -r tsconfig-paths/register ${seedScript}`, {
                cwd: process.cwd(),
                env: { ...process.env, NODE_ENV: 'test' }
            });
            console.log('Seed completed');
        }
    } catch (error) {
        console.error('Seed error:', error);
    }
}

async function truncateAllTables(): Promise<void> {
    if (!testClient) {
        testClient = await getTestClient();
    }

    const tables = await testClient.query(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename != 'migrations'
    `);

    const tableNames = tables.rows.map(r => r.tablename);
    if (tableNames.length > 0) {
        await testClient.query(`TRUNCATE ${tableNames.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
    }
}

beforeAll(async () => {
    console.log('\nSetting up test database...');

    adminClient = await getAdminClient();

    await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminClient.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    console.log(`Created database: ${TEST_DB_NAME}`);

    await adminClient.end();
    adminClient = null;

    await runMigrations();
    await runSeed();

    console.log('Test database ready\n');

    const bootstrap = ServiceBootstrap.getInstance();
    await bootstrap.initialize('Test Environment');
}, 60000);

beforeEach(async () => {
    await truncateAllTables();
});

afterEach(async () => {
    if (testClient) {
        await testClient.end();
        testClient = null;
    }
});

afterAll(async () => {
    console.log('\nCleaning up test database...');

    if (!adminClient) {
        adminClient = await getAdminClient();
    }

    await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    console.log(`Dropped database: ${TEST_DB_NAME}`);

    await adminClient.end();
}, 30000);
