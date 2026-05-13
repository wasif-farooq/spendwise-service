export type MessageHandler = (payload: any, correlationId?: string, topic?: string) => Promise<any>;

export interface IRpcClient {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    subscribe(topic: string, handler: MessageHandler): Promise<void>;
    reply(correlationId: string, result: any): Promise<void>;
}