import { Queue, QueueEvents } from 'bullmq';
import { bullmqConnection } from '@database/redisConnection';

export interface ActivityLogJobData {
  workspaceId: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  oldValues: Record<string, any> | null;
  newValues: Record<string, any> | null;
  metadata: Record<string, any>;
  activityDate: string;
}

export class ActivityQueue {
  private static instance: ActivityQueue;
  private queue: Queue;
  private queueEvents: QueueEvents;
  private connection: any;

  private constructor() {
    this.connection = bullmqConnection();

    this.queue = new Queue('activity-log', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 3600,
          count: 100,
        },
        removeOnFail: {
          age: 24 * 3600,
        },
      },
    });

    this.queueEvents = new QueueEvents('activity-log', { connection: this.connection });
  }

  static getInstance(): ActivityQueue {
    if (!ActivityQueue.instance) {
      ActivityQueue.instance = new ActivityQueue();
    }
    return ActivityQueue.instance;
  }

  async add(data: ActivityLogJobData): Promise<void> {
    await this.queue.add('log-activity', data, {
      priority: 10,
    });
  }

  async addBatch(dataList: ActivityLogJobData[]): Promise<void> {
    const jobs = dataList.map((data) => ({
      name: 'log-activity',
      data,
      opts: { priority: 10 },
    }));
    await this.queue.addBulk(jobs);
  }

  async getWaitingCount(): Promise<number> {
    return this.queue.getWaitingCount();
  }

  async getCompletedCount(): Promise<number> {
    return this.queue.getCompletedCount();
  }

  async getFailedCount(): Promise<number> {
    return this.queue.getFailedCount();
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.queueEvents.close();
  }
}
