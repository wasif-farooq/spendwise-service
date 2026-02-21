import { DatabaseAbstractFactory } from '@abstract-factories/DatabaseAbstractFactory';
import { IDatabase } from '@interfaces/IDatabase';
import { Pool, PoolClient } from 'pg';
import { ConfigLoader } from '@config/ConfigLoader';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';
import { ILogger } from '@interfaces/ILogger';

// Detailed Implementation could be in a separate file, but checking prompt structure, 
// implementation is likely under 'src/database/impl...' or similar.
// For factory simplicity, defining a simple class here or creating one.
// Let's create a PostgresDatabase class inside this factory file or separate if needed.
// Given strict file structure, let's implement the factory to return a PostgresDatabase instance.

class PostgresTransaction implements IDatabase {
    constructor(private client: PoolClient) { }

    async connect(): Promise<void> {
        // Already connected
    }

    async disconnect(): Promise<void> {
        // Handled by the transaction manager
    }

    async query(text: string, params?: any[]): Promise<any> {
        return this.client.query(text, params);
    }

    isConnected(): boolean {
        return true;
    }

    async transaction<T>(callback: (trx: IDatabase) => Promise<T>): Promise<T> {
        // Savepoints could be implemented here for nested transactions
        // For now, just reuse the same client
        return callback(this);
    }
}


class PostgresDatabase implements IDatabase {
    private pool: Pool;
    private connected: boolean = false;

    constructor(private config: any, private logger: ILogger) {
        this.pool = new Pool({
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
            ssl: config.ssl,
            min: config.pool.min,
            max: config.pool.max
        });

        this.pool.on('error', (err) => {
            this.logger.error('Unexpected error on idle client', err.message);
            this.connected = false;
        });
    }

    async connect(): Promise<void> {
        const client = await this.pool.connect();
        client.release();
        this.connected = true;
        this.logger.info('Successfully connected to PostgreSQL');
    }

    async disconnect(): Promise<void> {
        await this.pool.end();
        this.connected = false;
        this.logger.info('Disconnected from PostgreSQL');
    }

    async query(text: string, params?: any[]): Promise<any> {
        return this.pool.query(text, params);
    }

    isConnected(): boolean {
        return this.connected;
    }

    async transaction<T>(callback: (trx: IDatabase) => Promise<T>): Promise<T> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const trx = new PostgresTransaction(client);
            const result = await callback(trx);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

export class PostgresFactory extends DatabaseAbstractFactory {
    // We can create instances based on logic

    createDatabase(): IDatabase {
        const config = ConfigLoader.getInstance();
        const dbConfig = config.get('database.postgres');
        // Using a logger would require dependency resolution or passing it in
        // For now, let's assume a basic console fallback or resolve via Container if strict
        // But Factory usually creates.
        // Let's assume console for simplicity inside this factory unless we inject logger factory.

        // Quick Fix: simple console logger proxy
        const logger: ILogger = {
            debug: console.debug,
            info: console.info,
            warn: console.warn,
            error: console.error
        };

        return new PostgresDatabase(dbConfig, logger);
    }
}
