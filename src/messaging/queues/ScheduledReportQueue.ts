import { Queue, QueueEvents } from 'bullmq';
import { ConfigLoader } from '@config/ConfigLoader';

export interface ScheduledReportJobData {
  scheduledReportId: string;
}

export class ScheduledReportQueue {
  private static instance: ScheduledReportQueue;
  private queue: Queue;
  private queueEvents: QueueEvents;
  private connection: any;

  private constructor() {
    const config = ConfigLoader.getInstance();
    const bullmqConfig = config.get('messaging.bullmq');
    this.connection = {
      host: bullmqConfig.connection.host,
      port: bullmqConfig.connection.port,
      password: bullmqConfig.connection.password || undefined,
    };

    this.queue = new Queue('scheduled-report', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 86400,
          count: 100,
        },
        removeOnFail: {
          age: 7 * 86400,
        },
      },
    });

    this.queueEvents = new QueueEvents('scheduled-report', { connection: this.connection });
  }

  static getInstance(): ScheduledReportQueue {
    if (!ScheduledReportQueue.instance) {
      ScheduledReportQueue.instance = new ScheduledReportQueue();
    }
    return ScheduledReportQueue.instance;
  }

  /**
   * Add or replace a repeatable job for a scheduled report.
   * Uses the scheduled report ID as the jobId for idempotent upserts.
   */
  async addRepeatableJob(
    scheduledReportId: string,
    cronExpression: string,
  ): Promise<void> {
    await this.queue.add(
      'process-report',
      { scheduledReportId },
      {
        jobId: `scheduled-report-${scheduledReportId}`,
        repeat: {
          pattern: cronExpression,
        },
      },
    );

    console.log(
      `[ScheduledReportQueue] Added repeatable job ${scheduledReportId} with cron: ${cronExpression}`,
    );
  }

  /**
   * Remove the repeatable job for a scheduled report.
   */
  async removeRepeatableJob(scheduledReportId: string): Promise<void> {
    const jobId = `scheduled-report-${scheduledReportId}`;
    const repeatableJobs = await this.queue.getRepeatableJobs();
    const job = repeatableJobs.find((j) => j.id === jobId);

    if (job) {
      await this.queue.removeRepeatable(jobId, { pattern: job.pattern || undefined });
      console.log(`[ScheduledReportQueue] Removed repeatable job ${scheduledReportId}`);
    }
  }

  /**
   * Get all active repeatable jobs.
   */
  async getRepeatableJobs(): Promise<Array<{ id: string; pattern: string; next: number }>> {
    const jobs = await this.queue.getRepeatableJobs();
    return jobs.map((j) => ({
      id: j.id || '',
      pattern: j.pattern || '',
      next: j.next || 0,
    }));
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.queueEvents.close();
  }
}
