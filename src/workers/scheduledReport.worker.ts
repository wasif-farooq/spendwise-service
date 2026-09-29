import { Worker, Job } from 'bullmq';
import { bullmqConnection } from '@database/redisConnection';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { PostgresFactory } from '@database/factories/PostgresFactory';
import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { CategoryRepository } from '@domains/categories/repositories/CategoryRepository';
import { ScheduledReportService } from '@domains/reports/services/ScheduledReportService';
import { ScheduledReportJobData } from '@messaging/queues/ScheduledReportQueue';

export class ScheduledReportWorker {
  private worker: Worker | null = null;
  private service: ScheduledReportService;

  constructor() {
    const db = new DatabaseFacade(new PostgresFactory());
    const transactionRepo = new TransactionRepository(db);
    const categoryRepo = new CategoryRepository(db);
    this.service = new ScheduledReportService(transactionRepo, categoryRepo);
  }

  async start(): Promise<void> {
    const connection = bullmqConnection();

    this.worker = new Worker(
      'scheduled-report',
      async (job: Job<ScheduledReportJobData>) => {
        await this.handleJob(job.data);
      },
      {
        connection,
        concurrency: 1,
      },
    );

    this.worker.on('completed', (job) => {
      console.log(`[ScheduledReportWorker] Job ${job.id} completed for report ${job.data.scheduledReportId}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[ScheduledReportWorker] Job ${job?.id} failed:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('[ScheduledReportWorker] Worker error:', err.message);
    });

    console.log('[ScheduledReportWorker] Started, listening for scheduled report jobs');
  }

  private async handleJob(data: ScheduledReportJobData): Promise<void> {
    const report = await this.service.getById(data.scheduledReportId);
    if (!report) {
      console.warn(`[ScheduledReportWorker] Scheduled report ${data.scheduledReportId} not found, skipping`);
      return;
    }

    if (!report.isActive) {
      console.log(`[ScheduledReportWorker] Scheduled report ${report.name} is inactive, skipping`);
      return;
    }

    console.log(`[ScheduledReportWorker] Processing scheduled report: ${report.name}`);

    // Reuse the existing processSingleReport logic
    await this.service.processSingleReport(report);
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    console.log('[ScheduledReportWorker] Stopped');
  }
}
