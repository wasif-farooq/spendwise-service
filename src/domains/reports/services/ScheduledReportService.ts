import { ScheduledReportRepository } from '../repositories/ScheduledReportRepository';
import { ReportService } from './ReportService';
import { calculateNextRunAt } from './reportUtils';
import { ScheduledReportQueue } from '@messaging/queues/ScheduledReportQueue';
import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { CategoryRepository } from '@domains/categories/repositories/CategoryRepository';
import type { ExchangeRateService } from '@domains/exchange-rates/services/ExchangeRateService';
import {
  CreateScheduledReport,
  UpdateScheduledReport,
  ScheduledReportListParams,
  ScheduledReport,
} from '@domains/reports/models/ScheduledReport';

export class ScheduledReportService {
  private scheduledRepo: ScheduledReportRepository;
  private reportService: ReportService;

  constructor(
    transactionRepo: TransactionRepository,
    categoryRepo: CategoryRepository,
    exchangeRateService: ExchangeRateService,
  ) {
    this.scheduledRepo = new ScheduledReportRepository();
    this.reportService = new ReportService(transactionRepo, categoryRepo, exchangeRateService);
  }

  async create(data: CreateScheduledReport) {
    const id = await this.scheduledRepo.create(data);
    await this.syncRepeatableJob(id, data.frequency, data.dayOfWeek, data.dayOfMonth, data.timeOfDay || '09:00');
    return { id, message: 'Scheduled report created successfully' };
  }

  async getById(id: string): Promise<ScheduledReport | null> {
    return this.scheduledRepo.findById(id);
  }

  async list(params: ScheduledReportListParams) {
    return this.scheduledRepo.list(params);
  }

  async update(id: string, data: UpdateScheduledReport) {
    const existing = await this.scheduledRepo.findById(id);
    if (!existing) {
      throw new Error('Scheduled report not found');
    }
    await this.scheduledRepo.update(id, data);

    const freq = data.frequency || existing.frequency;
    const dow = data.dayOfWeek !== undefined ? data.dayOfWeek : existing.dayOfWeek;
    const dom = data.dayOfMonth !== undefined ? data.dayOfMonth : existing.dayOfMonth;
    const tod = data.timeOfDay || existing.timeOfDay;

    if (data.isActive === false) {
      await this.removeRepeatableJob(id);
    } else {
      await this.syncRepeatableJob(id, freq, dow, dom, tod);
    }

    return { message: 'Scheduled report updated successfully' };
  }

  async delete(id: string) {
    const existing = await this.scheduledRepo.findById(id);
    if (!existing) {
      throw new Error('Scheduled report not found');
    }
    await this.removeRepeatableJob(id);
    await this.scheduledRepo.delete(id);
    return { message: 'Scheduled report deleted successfully' };
  }

  async toggleActive(id: string, isActive: boolean) {
    const existing = await this.scheduledRepo.findById(id);
    if (!existing) {
      throw new Error('Scheduled report not found');
    }
    await this.scheduledRepo.update(id, { isActive });

    if (isActive) {
      await this.syncRepeatableJob(id, existing.frequency, existing.dayOfWeek, existing.dayOfMonth, existing.timeOfDay);
    } else {
      await this.removeRepeatableJob(id);
    }

    return { message: `Scheduled report ${isActive ? 'activated' : 'deactivated'}` };
  }

  /**
   * Process a single scheduled report. Called by the BullMQ worker.
   */
  async processSingleReport(report: ScheduledReport): Promise<void> {
    try {
      const dateRange = report.frequency === 'weekly' ? 'last7days' : 'lastMonth';

      await this.reportService.handleExportRequest({
        workspaceId: report.workspaceId,
        userId: report.userId,
        userEmail: report.userEmail,
        dateRange,
        format: report.format,
      });

      const nextRun = calculateNextRunAt(
        report.frequency,
        report.dayOfWeek,
        report.dayOfMonth,
        report.timeOfDay,
      );
      await this.scheduledRepo.updateNextRunAt(report.id, nextRun);

      console.log(
        `[SCHEDULED-REPORT] Successfully processed report "${report.name}" for workspace ${report.workspaceId}`,
      );
    } catch (error: any) {
      console.error(
        `[SCHEDULED-REPORT] Failed to process report "${report.name}" (id: ${report.id}):`,
        error,
      );

      const nextRun = calculateNextRunAt(
        report.frequency,
        report.dayOfWeek,
        report.dayOfMonth,
        report.timeOfDay,
      );
      await this.scheduledRepo.updateNextRunAt(report.id, nextRun);
      throw error;
    }
  }

  /**
   * Generate a cron expression from schedule parameters.
   * Weekly: "0 HH * * Dow" (day of week 0-6)
   * Monthly: "0 HH DoM * *" (day of month 1-31)
   */
  getCronExpression(
    frequency: string,
    dayOfWeek?: number,
    dayOfMonth?: number,
    timeOfDay: string = '09:00',
  ): string {
    const [hours, minutes] = timeOfDay.split(':').map(Number);
    const minute = minutes || 0;
    const hour = hours || 9;

    if (frequency === 'weekly') {
      const dow = dayOfWeek ?? 1;
      return `${minute} ${hour} * * ${dow}`;
    } else {
      const dom = dayOfMonth ?? 1;
      return `${minute} ${hour} ${dom} * *`;
    }
  }

  /**
   * Sync all scheduled reports with BullMQ repeatable jobs.
   * Called on worker startup to ensure all jobs are registered.
   */
  async syncAllRepeatableJobs(): Promise<{ synced: number; removed: number }> {
    const queue = ScheduledReportQueue.getInstance();

    // Query all reports across all workspaces (for sync on startup)
    const allReports = await this.scheduledRepo.findAll(1000);
    const activeReports = allReports.filter((r: ScheduledReport) => r.isActive);
    let synced = 0;
    let removed = 0;

    // Get existing repeatable jobs from BullMQ
    const existingJobs = await queue.getRepeatableJobs();
    const existingJobIds = new Set(existingJobs.map((j) => j.id));

    // Add/update repeatable jobs for active reports
    for (const report of activeReports) {
      const cronExpression = this.getCronExpression(
        report.frequency,
        report.dayOfWeek,
        report.dayOfMonth,
        report.timeOfDay,
      );

      const jobId = `scheduled-report-${report.id}`;
      // Remove existing job if schedule changed
      if (existingJobIds.has(jobId)) {
        await queue.removeRepeatableJob(report.id);
      }

      await queue.addRepeatableJob(report.id, cronExpression);
      existingJobIds.delete(jobId);
      synced++;
    }

    // Remove orphaned jobs (reports deleted or deactivated since last sync)
    for (const jobId of existingJobIds) {
      if (jobId.startsWith('scheduled-report-')) {
        const reportId = jobId.replace('scheduled-report-', '');
        const stillExists = allReports.find(
          (r: ScheduledReport) => r.id === reportId && r.isActive,
        );
        if (!stillExists) {
          await queue.removeRepeatableJob(reportId);
          removed++;
        }
      }
    }

    console.log(
      `[ScheduledReportService] Synced ${synced} active reports, removed ${removed} orphaned jobs`,
    );
    return { synced, removed };
  }

  private async syncRepeatableJob(
    id: string,
    frequency: string,
    dayOfWeek?: number,
    dayOfMonth?: number,
    timeOfDay?: string,
  ): Promise<void> {
    try {
      const queue = ScheduledReportQueue.getInstance();
      await queue.removeRepeatableJob(id);
      const cronExpression = this.getCronExpression(frequency, dayOfWeek, dayOfMonth, timeOfDay);
      await queue.addRepeatableJob(id, cronExpression);
    } catch (error: any) {
      console.error(`[ScheduledReportService] Failed to sync repeatable job ${id}:`, error);
    }
  }

  private async removeRepeatableJob(id: string): Promise<void> {
    try {
      const queue = ScheduledReportQueue.getInstance();
      await queue.removeRepeatableJob(id);
    } catch (error: any) {
      console.error(`[ScheduledReportService] Failed to remove repeatable job ${id}:`, error);
    }
  }
}
