import { MessageQueueAbstractFactory } from '../abstract-factories/MessageQueueAbstractFactory';
import { IMessageQueue } from '@interfaces/IMessageQueue';
import { KafkaClient } from  '../implementations/kafka/KafkaClient';

export class KafkaMessageQueueFactory extends MessageQueueAbstractFactory {
    createMessageQueue(): IMessageQueue {
        return new KafkaClient();
    }
}
