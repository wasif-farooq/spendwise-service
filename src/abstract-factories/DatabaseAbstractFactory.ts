import { IDatabase } from '@interfaces/IDatabase';

export abstract class DatabaseAbstractFactory {
    abstract createDatabase(): IDatabase;
}
