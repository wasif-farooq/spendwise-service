import { IDatabase } from '@interfaces/IDatabase';
import { DatabaseAbstractFactory } from '@abstract-factories/DatabaseAbstractFactory';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';

export class DatabaseFacade {
    private database: IDatabase;

    constructor(factoryOrDb: DatabaseAbstractFactory | IDatabase) {
        if ('createDatabase' in factoryOrDb) {
            this.database = factoryOrDb.createDatabase();
        } else {
            this.database = factoryOrDb;
        }
    }

    async connect(): Promise<void> {
        await this.database.connect();
    }

    async disconnect(): Promise<void> {
        await this.database.disconnect();
    }

    async query(text: string, params?: any[]): Promise<any> {
        return this.database.query(text, params);
    }

    async transaction<T>(callback: (trx: DatabaseFacade) => Promise<T>): Promise<T> {
        return this.database.transaction(async (trxDb) => {
            const trxFacade = new DatabaseFacade(trxDb);
            return callback(trxFacade);
        });
    }

    get raw() {
        return this.database;
    }
}
