export interface IDatabase {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    query(text: string, params?: any[]): Promise<any>;
    isConnected(): boolean;
    transaction<T>(callback: (trx: IDatabase) => Promise<T>): Promise<T>;
}
