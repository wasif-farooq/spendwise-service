import { EmailServiceFactory, IEmailService } from '@domains/email';
import {
  generateExpenseReportEmailHtml,
  getExpenseReportSubject,
} from '@domains/email/EmailTemplates';
import { ExpenseReportGenerator, ExpenseReportData } from './ExpenseReportGenerator';
import { generateExpenseReportCsv } from './CsvGenerator';
import { generateExpenseReportXlsx } from './XlsxGenerator';
import { ExportReportRequest, DateRangePreset, CustomDateRange } from '../types';
import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { CategoryRepository } from '@domains/categories/repositories/CategoryRepository';

export interface ReportDownloadResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

export class ReportService {
  private emailService: IEmailService;
  private reportGenerator: ExpenseReportGenerator;

  constructor(transactionRepo: TransactionRepository, categoryRepo: CategoryRepository) {
    this.emailService = EmailServiceFactory.create();
    this.reportGenerator = new ExpenseReportGenerator(transactionRepo, categoryRepo);
  }

  /**
   * Generate report and return as a buffer for direct download.
   */
  async generateReport(
    workspaceId: string,
    dateRange: DateRangePreset,
    customDates?: CustomDateRange,
    format: 'csv' | 'xlsx' = 'csv',
  ): Promise<ReportDownloadResult> {
    const reportData = await this.reportGenerator.generate(workspaceId, dateRange, customDates);

    const buffer = format === 'csv'
      ? generateExpenseReportCsv(reportData)
      : generateExpenseReportXlsx(reportData);

    const startDate = customDates?.startDate || reportData.period.startDate;
    const endDate = customDates?.endDate || reportData.period.endDate;
    const filenameDate = `${startDate}_to_${endDate}`.replace(/-/g, '');

    return {
      buffer,
      filename: `expense_report_${filenameDate}.${format}`,
      contentType:
        format === 'csv'
          ? 'text/csv'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async handleExportRequest(request: ExportReportRequest): Promise<void> {
    const { workspaceId, userEmail, dateRange, customDates, format } = request;

    // 1. Generate report data
    const reportData = await this.reportGenerator.generate(workspaceId, dateRange, customDates);

    // 2. Generate attachment
    const attachment =
      format === 'csv'
        ? generateExpenseReportCsv(reportData)
        : generateExpenseReportXlsx(reportData);

    const startDate = customDates?.startDate || reportData.period.startDate;
    const endDate = customDates?.endDate || reportData.period.endDate;
    const filenameDate = `${startDate}_to_${endDate}`.replace(/-/g, '');

    // 3. Send email with attachment
    await this.emailService.send({
      to: userEmail,
      subject: getExpenseReportSubject(reportData),
      html: generateExpenseReportEmailHtml(reportData),
      attachments: [
        {
          filename: `expense_report_${filenameDate}.${format}`,
          content: attachment,
          contentType:
            format === 'csv'
              ? 'text/csv'
              : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    });

    console.log(
      `[REPORT] Export report sent to ${userEmail} for period ${startDate} to ${endDate}`,
    );
  }
}

export class ReportServiceFactory {
  static create(
    transactionRepo: TransactionRepository,
    categoryRepo: CategoryRepository,
  ): ReportService {
    return new ReportService(transactionRepo, categoryRepo);
  }
}
