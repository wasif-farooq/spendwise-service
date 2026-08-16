import { MessageQueueAbstractFactory } from '@messaging/abstract-factories/MessageQueueAbstractFactory';
import { IMessageQueue } from '@interfaces/IMessageQueue';
import { BullMQClient } from '../implementations/bullmq/BullMQClient';

export class BullMQMessageQueueFactory extends MessageQueueAbstractFactory {
  createMessageQueue(): IMessageQueue {
    return new BullMQClient();
  }
}
