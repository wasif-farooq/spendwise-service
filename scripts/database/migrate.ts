import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { ConfigLoader } from '@config/ConfigLoader';

async function runMigrations() {
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

        // Create migrations table if not exists
        await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        run_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

        // Determine version from args
        const args = process.argv.slice(2);
        const versionArg = args.find(arg => arg.startsWith('--version='));
        const version = versionArg ? versionArg.split('=')[1] : 'v1';

        const migrationDir = path.resolve(process.cwd(), `config/database/migrations/${version}`);

        if (!fs.existsSync(migrationDir)) {
            console.log(`No migrations found for version ${version}`);
            return;
        }

        const files = fs.readdirSync(migrationDir).sort();

        for (const file of files) {
            if (!file.endsWith('.sql')) continue;

            // Check if migration already run
            const res = await client.query('SELECT * FROM migrations WHERE name = $1', [file]);
            if (res.rows.length > 0) {
                console.log(`Skipping ${file} (already run)`);
                continue;
            }

            console.log(`Running ${file}...`);
            const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');

            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
                await client.query('COMMIT');
                console.log(`Success: ${file}`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`Failed: ${file}`, err);
                process.exit(1);
            }
        }

        console.log('All migrations completed successfully.');
    } catch (err) {
        console.error('Migration error:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runMigrations();
