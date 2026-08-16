import { IRpcClient, MessageHandler } from '@messaging/interfaces/IRpcClient';
import { Kafka, Producer, Consumer } from 'kafkajs';
import { ConfigLoader } from '@config/ConfigLoader';

export class KafkaRpcClient implements IRpcClient {
  private kafka: Kafka;
  private producer: Producer;
  private consumer: Consumer;
  private replyTopic: string = 'api.gateway.replies';
  private connected: boolean = false;
  private handlers: Map<string, MessageHandler> = new Map();

  constructor() {
    const config = ConfigLoader.getInstance();
    const kafkaConfig = config.get('messaging.kafka');

    this.kafka = new Kafka({
      clientId: kafkaConfig.clientId + '-worker',
      brokers: kafkaConfig.brokers,
    });

    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId: kafkaConfig.groupId });
  }

  async connect(): Promise<void> {
    await this.producer.connect();
    await this.consumer.connect();
    this.connected = true;
    console.log('[KafkaRpcClient] Connected to Kafka');
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
    await this.consumer.disconnect();
    this.connected = false;
    console.log('[KafkaRpcClient] Disconnected from Kafka');
  }

  async subscribe(topic: string, handler: MessageHandler): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }

    await this.consumer.subscribe({ topic, fromBeginning: false });
    this.handlers.set(topic, handler);
    console.log(`[KafkaRpcClient] Subscribed to topic: ${topic}`);
  }

  async startListening(): Promise<void> {
    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const replyTo = message.headers?.replyTo?.toString();
        const correlationId = message.headers?.correlationId?.toString();
        const isFireAndForget = !replyTo && !correlationId;

        if (!replyTo && !correlationId && topic !== 'reports.export') return;

        const handler = this.handlers.get(topic);
        if (!handler) {
          console.warn(`[KafkaRpcClient] No handler for topic: ${topic}`);
          return;
        }

        const payload = JSON.parse(message.value?.toString() || '{}');
        payload._topic = topic;

        try {
          const result = await handler(payload, correlationId, topic);

          if (replyTo && correlationId) {
            await this.producer.send({
              topic: replyTo,
              messages: [
                {
                  value: JSON.stringify(result ?? { success: true }),
                  headers: { correlationId },
                },
              ],
            });
          }
        } catch (error: any) {
          console.error(`[KafkaRpcClient] Error processing ${topic}`, error);

          if (replyTo && correlationId) {
            const errorResponse = {
              error: error.message || 'Internal Error',
              statusCode: 500,
            };
            await this.producer.send({
              topic: replyTo,
              messages: [
                {
                  value: JSON.stringify(errorResponse),
                  headers: { correlationId },
                },
              ],
            });
          }
        }
      },
    });
  }

  async reply(correlationId: string, result: any): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }

    await this.producer.send({
      topic: this.replyTopic,
      messages: [
        {
          value: JSON.stringify(result),
          headers: { correlationId },
        },
      ],
    });
  }
}
