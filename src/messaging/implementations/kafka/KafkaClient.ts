import { IMessageQueue } from '@interfaces/IMessageQueue';
import { Kafka, Producer, Consumer } from 'kafkajs';
import { ConfigLoader } from '@config/ConfigLoader';

export class KafkaClient implements IMessageQueue {
    private kafka: Kafka;
    private producer: Producer;
    private consumer: Consumer;
    private connected: boolean = false;

    constructor() {
        const config = ConfigLoader.getInstance();
        const kafkaConfig = config.get('messaging.kafka');

        this.kafka = new Kafka({
            clientId: kafkaConfig.clientId,
            brokers: kafkaConfig.brokers,
        });

        this.producer = this.kafka.producer();
        this.consumer = this.kafka.consumer({ groupId: kafkaConfig.groupId });
    }

    async connect(): Promise<void> {
        await this.producer.connect();
        await this.consumer.connect();
        this.connected = true;
        console.log('Connected to Kafka'); // Replace with Logger
    }

    async disconnect(): Promise<void> {
        await this.producer.disconnect();
        await this.consumer.disconnect();
        this.connected = false;
    }

    async publish(topic: string, message: any): Promise<void> {
        await this.producer.send({
            topic,
            messages: [{ value: JSON.stringify(message) }],
        });
    }

    async subscribe(topic: string, handler: (message: any) => Promise<void>): Promise<void> {
        await this.consumer.subscribe({ topic, fromBeginning: false });
        await this.consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                if (message.value) {
                    const payload = JSON.parse(message.value.toString());
                    await handler(payload);
                }
            },
        });
    }
}
