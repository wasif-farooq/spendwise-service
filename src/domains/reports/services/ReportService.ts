import { getEmailService, IEmailService } from '@domains/email';
import {
  generateExpenseReportEmailHtml,
  generateExpenseReportEmailText,
  getExpenseReportSubject,
} from '@domains/email/EmailTemplates';
import { ExpenseReportGenerator, ExpenseReportData } from './ExpenseReportGenerator';
import { generateExpenseReportCsv } from './CsvGenerator';
import { generateExpenseReportXlsx } from './XlsxGenerator';
import { ExportReportRequest, DateRangePreset, CustomDateRange } from '../types';
import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { CategoryRepository } from '@domains/categories/repositories/CategoryRepository';
import type { ExchangeRateService } from '@domains/exchange-rates/services/ExchangeRateService';
import type { AccountAccess } from '@domains/workspaces/services/AccountAccess';

/** Resolves a user's account access in a workspace (see resolveAccountAccess). */
export type AccountAccessResolver = (userId: string, workspaceId: string) => Promise<AccountAccess>;

/** Resolves through the container's database, loaded lazily so importing opens nothing. */
const containerAccessResolver: AccountAccessResolver = (userId, workspaceId) => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { Container } = require('@di/Container');
  const { TOKENS } = require('@di/tokens');
  const { resolveAccountAccess } = require('@domains/workspaces/services/AccountAccess');
  /* eslint-enable @typescript-eslint/no-var-requires */
  return resolveAccountAccess(
    Container.getInstance().resolve(TOKENS.Database),
    userId,
    workspaceId,
  );
};

export interface ReportDownloadResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

export class ReportService {
  private emailService: IEmailService;
  private reportGenerator: ExpenseReportGenerator;

  constructor(
    transactionRepo: TransactionRepository,
    categoryRepo: CategoryRepository,
    exchangeRateService: ExchangeRateService,
    private resolveAccess: AccountAccessResolver = containerAccessResolver,
  ) {
    this.emailService = getEmailService();
    this.reportGenerator = new ExpenseReportGenerator(
      transactionRepo,
      categoryRepo,
      async (from, to) => (await exchangeRateService.convert(1, from, to)).rate,
    );
  }

  /**
   * Generate report and return as a buffer for direct download.
   */
  async generateReport(
    workspaceId: string,
    dateRange: DateRangePreset,
    customDates?: CustomDateRange,
    format: 'csv' | 'xlsx' = 'csv',
    accountIds?: string[],
  ): Promise<ReportDownloadResult> {
    const reportData = await this.reportGenerator.generate(
      workspaceId,
      dateRange,
      customDates,
      accountIds,
    );

    const buffer =
      format === 'csv'
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
    const { workspaceId, userId, userEmail, dateRange, customDates, format } = request;

    // The report only covers the accounts the requester can see — also for a
    // scheduled report, whose owner's access may have changed since it was set up.
    let accountIds = request.accountIds;
    if (accountIds === undefined && userId) {
      accountIds = (await this.resolveAccess(userId, workspaceId)).accountIdsWith(
        'transactions:view',
      );
    }

    // 1. Generate report data
    const reportData = await this.reportGenerator.generate(
      workspaceId,
      dateRange,
      customDates,
      accountIds,
    );

    // 2. Generate attachment
    const attachment =
      format === 'csv'
        ? generateExpenseReportCsv(reportData)
        : generateExpenseReportXlsx(reportData);

    const startDate = customDates?.startDate || reportData.period.startDate;
    const endDate = customDates?.endDate || reportData.period.endDate;
    const filenameDate = `${startDate}_to_${endDate}`.replace(/-/g, '');

    // 3. Send email with attachment
    const result = await this.emailService.send({
      to: userEmail,
      subject: getExpenseReportSubject(reportData),
      text: generateExpenseReportEmailText(reportData),
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

    if (!result.success) {
      // Logged, not thrown: the export request answers as it always has.
      console.error(
        `[REPORT] Export report email not sent for period ${startDate} to ${endDate}: ${result.error ?? 'unknown error'}`,
      );
      return;
    }

    console.log(
      `[REPORT] Export report sent to ${userEmail} for period ${startDate} to ${endDate}`,
    );
  }
}

export class ReportServiceFactory {
  static create(
    transactionRepo: TransactionRepository,
    categoryRepo: CategoryRepository,
    exchangeRateService: ExchangeRateService,
    resolveAccess?: AccountAccessResolver,
  ): ReportService {
    return new ReportService(transactionRepo, categoryRepo, exchangeRateService, resolveAccess);
  }
}
