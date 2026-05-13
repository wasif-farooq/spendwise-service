import { IMessageQueue } from '@interfaces/IMessageQueue';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { ConfigLoader } from '@config/ConfigLoader';

export class BullMQClient implements IMessageQueue {
    private queues: Map<string, Queue> = new Map();
    private workers: Map<string, Worker> = new Map();
    private queueEvents: Map<string, QueueEvents> = new Map();
    private connected: boolean = false;

    constructor() {
        const config = ConfigLoader.getInstance();
        const bullmqConfig = config.get('messaging.bullmq');
        this.connection = bullmqConfig.connection;
    }

    private connection: {
        host: string;
        port: number;
        password?: string;
    };

    async connect(): Promise<void> {
        this.connected = true;
        console.log('[BullMQClient] Connected to Redis');
    }

    async disconnect(): Promise<void> {
        for (const worker of this.workers.values()) {
            await worker.close();
        }
        for (const queueEvents of this.queueEvents.values()) {
            await queueEvents.close();
        }
        this.workers.clear();
        this.queues.clear();
        this.queueEvents.clear();
        this.connected = false;
        console.log('[BullMQClient] Disconnected');
    }

    async publish(topic: string, message: any): Promise<void> {
        if (!this.connected) {
            console.log('[BullMQClient] Connecting to Redis...');
            try {
                await this.connect();
            } catch (err) {
                console.error('[BullMQClient] Failed to connect to Redis:', err);
                throw new Error('Redis unavailable');
            }
        }

        let queue = this.queues.get(topic);
        if (!queue) {
            queue = new Queue(topic, { connection: this.connection });
            this.queues.set(topic, queue);
        }

        await queue.add(topic, message, {
            removeOnComplete: true,
            removeOnFail: false,
        });
    }

    async subscribe(topic: string, handler: (message: any) => Promise<void>): Promise<void> {
        if (!this.connected) {
            await this.connect();
        }

        if (this.workers.has(topic)) {
            console.log(`[BullMQClient] Worker already exists for topic: ${topic}`);
            return;
        }

        const queue = new Queue(topic, { connection: this.connection });
        this.queues.set(topic, queue);

        const queueEvents = new QueueEvents(topic, { connection: this.connection });
        this.queueEvents.set(topic, queueEvents);

        const worker = new Worker(topic, async (job) => {
            await handler(job.data);
        }, { connection: this.connection });

        this.workers.set(topic, worker);

        worker.on('completed', (job) => {
            console.log(`[BullMQClient] Job ${job.id} completed for topic: ${topic}`);
        });

        worker.on('failed', (job, err) => {
            console.error(`[BullMQClient] Job ${job?.id} failed for topic: ${topic}`, err.message);
        });
    }
}