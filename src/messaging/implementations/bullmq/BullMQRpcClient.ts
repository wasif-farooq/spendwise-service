import { IRpcClient, MessageHandler } from '@messaging/interfaces/IRpcClient';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { ConfigLoader } from '@config/ConfigLoader';

export class BullMQRpcClient implements IRpcClient {
    private queues: Map<string, Queue> = new Map();
    private workers: Map<string, Worker> = new Map();
    private replyQueue: Queue;
    private replyQueueEvents: QueueEvents;
    private connection: { host: string; port: number; password?: string };
    private connected: boolean = false;
    private handlers: Map<string, MessageHandler> = new Map();
    private replyTopics: Map<string, string> = new Map();

    constructor() {
        const config = ConfigLoader.getInstance();
        const bullmqConfig = config.get('messaging.bullmq');
        this.connection = bullmqConfig.connection;
        this.replyQueue = new Queue('worker.replies', { connection: this.connection });
        this.replyQueueEvents = new QueueEvents('worker.replies', { connection: this.connection });
    }

    async connect(): Promise<void> {
        this.connected = true;
        console.log('[BullMQRpcClient] Connected to Redis');
    }

    async disconnect(): Promise<void> {
        for (const worker of this.workers.values()) {
            await worker.close();
        }
        this.workers.clear();
        this.queues.clear();
        this.connected = false;
        console.log('[BullMQRpcClient] Disconnected');
    }

    async subscribe(topic: string, handler: MessageHandler): Promise<void> {
        if (!this.connected) {
            await this.connect();
        }

        if (this.workers.has(topic)) {
            console.log(`[BullMQRpcClient] Worker already exists for topic: ${topic}`);
            return;
        }

        const queue = new Queue(topic, { connection: this.connection });
        this.queues.set(topic, queue);
        this.handlers.set(topic, handler);

        const worker = new Worker(topic, async (job) => {
            const correlationId = job.data.correlationId;
            const replyTo = job.data.replyTo;
            const replyQueueName = job.data.replyQueue;

            this.replyTopics.set(correlationId || job.id!, replyQueueName || 'worker.replies');

            const payload = { ...job.data, _topic: topic };

            try {
                const result = await handler(payload, correlationId, topic);

                if (replyTo || correlationId) {
                    await this.reply(correlationId || job.id!, result);
                }
            } catch (error: any) {
                console.error(`[BullMQRpcClient] Error processing job ${job.id}`, error);

                if (replyTo || correlationId) {
                    await this.reply(correlationId || job.id!, {
                        error: error.message || 'Internal Error',
                        statusCode: 500
                    });
                }
                throw error;
            }
        }, { connection: this.connection });

        this.workers.set(topic, worker);

        worker.on('completed', (job) => {
            console.log(`[BullMQRpcClient] Job ${job.id} completed for topic: ${topic}`);
        });

        worker.on('failed', (job, err) => {
            console.error(`[BullMQRpcClient] Job ${job?.id} failed for topic: ${topic}`, err.message);
        });

        console.log(`[BullMQRpcClient] Subscribed to topic: ${topic}`);
    }

    async reply(correlationId: string, result: any): Promise<void> {
        if (!this.connected) {
            await this.connect();
        }

        const replyQueueName = this.replyTopics.get(correlationId) || 'worker.replies';
        const replyQueue = new Queue(replyQueueName, { connection: this.connection });

        await replyQueue.add('reply', {
            correlationId,
            result
        });
    }
}