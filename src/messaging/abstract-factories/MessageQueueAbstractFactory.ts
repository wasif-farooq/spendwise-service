import { IMessageQueue } from '@interfaces/IMessageQueue';

export abstract class MessageQueueAbstractFactory {
    abstract createMessageQueue(): IMessageQueue;
}
