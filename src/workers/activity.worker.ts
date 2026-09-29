import { Worker, Job } from 'bullmq';
import { bullmqConnection } from '@database/redisConnection';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { PostgresFactory } from '@database/factories/PostgresFactory';
import { ActivityLogRepository } from '@domains/activity/repositories/ActivityLogRepository';
import { ActivityLogJobData } from '@messaging/queues/ActivityQueue';

export class ActivityWorker {
  private worker: Worker | null = null;
  private db: DatabaseFacade;
  private repository: ActivityLogRepository;
  private batch: ActivityLogJobData[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private batchSize: number;
  private batchTimeoutMs: number;

  constructor() {
    const dbFactory = new PostgresFactory();
    this.db = new DatabaseFacade(dbFactory);
    this.repository = new ActivityLogRepository(this.db);

    this.batchSize = parseInt(process.env.ACTIVITY_LOG_BATCH_SIZE || '50');
    this.batchTimeoutMs = parseInt(process.env.ACTIVITY_LOG_BATCH_TIMEOUT_MS || '2000');
  }

  async start(): Promise<void> {
    const connection = bullmqConnection();

    this.worker = new Worker(
      'activity-log',
      async (job: Job) => {
        await this.handleJob(job.data);
      },
      {
        connection,
        concurrency: 1,
      },
    );

    this.worker.on('completed', (job) => {
      console.log(`[ActivityWorker] Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[ActivityWorker] Job ${job?.id} failed:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('[ActivityWorker] Worker error:', err.message);
    });

    console.log('[ActivityWorker] Started, listening for activity log jobs');
  }

  private async handleJob(data: ActivityLogJobData): Promise<void> {
    this.batch.push(data);

    if (this.batch.length >= this.batchSize) {
      await this.flushBatch();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(async () => {
        await this.flushBatch();
      }, this.batchTimeoutMs);
    }
  }

  private async flushBatch(): Promise<void> {
    if (this.batch.length === 0) return;

    const batchToFlush = [...this.batch];
    this.batch = [];

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    try {
      const propsList = batchToFlush.map((job) => ({
        workspaceId: job.workspaceId,
        userId: job.userId,
        entityType: job.entityType,
        entityId: job.entityId,
        action: job.action,
        oldValues: job.oldValues,
        newValues: job.newValues,
        metadata: job.metadata,
        activityDate: new Date(job.activityDate),
      }));

      await this.repository.createBatch(propsList);
      console.log(`[ActivityWorker] Flushed batch of ${batchToFlush.length} activity logs`);
    } catch (error) {
      console.error('[ActivityWorker] Failed to flush batch:', error);
      this.batch.unshift(...batchToFlush);
      throw error;
    }
  }

    async stop(): Promise<void> {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        if (this.batch.length > 0) {
            await this.flushBatch();
        }

        if (this.worker) {
            await this.worker.close();
            this.worker = null;
        }

        console.log('[ActivityWorker] Stopped');
    }
}
