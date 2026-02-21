import { Kafka, Producer, Consumer } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import { ConfigLoader } from '@config/ConfigLoader';

export class KafkaRequestReply {
    private kafka: Kafka;
    private producer: Producer;
    private consumer: Consumer;
    private replyTopic: string;
    private connected: boolean = false;
    private pendingRequests: Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void; timeout: NodeJS.Timeout }> = new Map();

    constructor() {
        const config = ConfigLoader.getInstance();
        const kafkaConfig = config.get('messaging.kafka');

        this.kafka = new Kafka({
            clientId: kafkaConfig.clientId + '-rpc',
            brokers: kafkaConfig.brokers,
        });

        this.replyTopic = `gateway.replies.${uuidv4()}`; // Unique reply topic for this instance (or use shared with partition routing)
        // For simplicity in this implementation, we use a unique group/topic or a shared reply topic with filtering.
        // Let's use a shared reply topic 'api.gateway.replies' but filtering is inefficient without partitions.
        // Better: 'api.gateway.replies' and we filter by correlationId.
        this.replyTopic = 'api.gateway.replies';

        this.producer = this.kafka.producer();
        this.consumer = this.kafka.consumer({ groupId: `gateway-rpc-${uuidv4()}` }); // Unique group to get all replies (broadcast) or shared? 
        // If we use load balancing, the reply must come back to *this* instance.
        // So Unique Group ID is required if listening to a shared topic, ensuring we get the message.
    }

    async connect(): Promise<void> {
        await this.producer.connect();
        await this.consumer.connect();
        await this.consumer.subscribe({ topic: this.replyTopic, fromBeginning: false });

        await this.consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                const correlationId = message.headers?.correlationId?.toString();
                if (correlationId && this.pendingRequests.has(correlationId)) {
                    const { resolve, timeout } = this.pendingRequests.get(correlationId)!;
                    clearTimeout(timeout);
                    this.pendingRequests.delete(correlationId);

                    const payload = message.value ? JSON.parse(message.value.toString()) : null;

                    // Check for errors in payload
                    if (payload && payload.error) {
                        // We could reject here if the service sent an error
                        // this.pendingRequests.get(correlationId)!.reject(new Error(payload.error));
                        // But for now resolving with payload
                    }

                    resolve(payload);
                }
            },
        });
        this.connected = true;
        console.log(`Kafka RPC Connected. Listening on ${this.replyTopic}`);
    }

    async request(topic: string, payload: any, timeoutMs: number = 10000): Promise<any> {
        if (!this.connected) await this.connect();

        const correlationId = uuidv4();

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(correlationId)) {
                    this.pendingRequests.delete(correlationId);
                    reject(new Error(`Request timed out after ${timeoutMs}ms`));
                }
            }, timeoutMs);

            this.pendingRequests.set(correlationId, { resolve, reject, timeout });

            this.producer.send({
                topic,
                messages: [{
                    value: JSON.stringify(payload),
                    headers: {
                        correlationId,
                        replyTo: this.replyTopic
                    }
                }]
            }).catch(err => {
                clearTimeout(timeout);
                this.pendingRequests.delete(correlationId);
                reject(err);
            });
        });
    }

    async disconnect() {
        await this.producer.disconnect();
        await this.consumer.disconnect();
    }
}
