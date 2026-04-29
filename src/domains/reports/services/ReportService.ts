import { EmailServiceFactory, IEmailService } from '@domains/email';
import { generateExpenseReportEmailHtml, getExpenseReportSubject } from '@domains/email/EmailTemplates';
import { ExpenseReportGenerator, ExpenseReportData } from './ExpenseReportGenerator';
import { generateExpenseReportCsv } from './CsvGenerator';
import { generateExpenseReportXlsx } from './XlsxGenerator';
import { ExportReportRequest } from '../types';
import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { CategoryRepository } from '@domains/categories/repositories/CategoryRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

export class ReportService {
  private emailService: IEmailService;
  private reportGenerator: ExpenseReportGenerator;

  constructor() {
    this.emailService = EmailServiceFactory.create('console');
    
    // Initialize repositories using singleton
    const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
    const transactionRepo = new TransactionRepository(db);
    const categoryRepo = new CategoryRepository(db);
    
    this.reportGenerator = new ExpenseReportGenerator(transactionRepo, categoryRepo);
  }

  async handleExportRequest(request: ExportReportRequest): Promise<void> {
    const { workspaceId, userEmail, dateRange, customDates, format } = request;

    // 1. Generate report data
    const reportData = await this.reportGenerator.generate(workspaceId, dateRange, customDates);

    // 2. Generate attachment
    const attachment = format === 'csv' 
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
      attachments: [{
        filename: `expense_report_${filenameDate}.${format}`,
        content: attachment,
        contentType: format === 'csv' 
          ? 'text/csv' 
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }]
    });

    console.log(`[REPORT] Export report sent to ${userEmail} for period ${startDate} to ${endDate}`);
  }
}

export class ReportServiceFactory {
  static create(): ReportService {
    return new ReportService();
  }
}