import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { ServiceFactory } from '@factories/ServiceFactory';
import { ReportService } from '@domains/reports/services/ReportService';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import {
  CreateReportRequest,
  ReportRequestListParams,
} from '@domains/reports/models/ReportRequest';

export class ReportRequestRepository {
  private config = ConfigLoader.getInstance();
  private cachedService!: ReportService;

  private getMode(): string {
    return this.config.get('repository.mode') || 'direct';
  }

  private getService(): ReportService {
    if (this.cachedService) {
      return this.cachedService;
    }

    const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
    const repoFactory = new RepositoryFactory(db);
    const serviceFactory = new ServiceFactory(repoFactory, db);

    this.cachedService = serviceFactory.createReportService();
    return this.cachedService;
  }

  private getDb(): DatabaseFacade {
    return Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
  }

  private wrap(promise: Promise<any>): Promise<any> {
    return promise
      .then((data) => ({ data, error: null, statusCode: 200 }))
      .catch((error) => ({
        error: error.message || 'An error occurred',
        statusCode: error.statusCode || 500,
        data: null,
      }));
  }

  async exportReport(
    workspaceId: string,
    userEmail: string,
    data: {
      dateRange?:
        | 'last7days'
        | 'last30days'
        | 'thisMonth'
        | 'lastMonth'
        | 'thisYear'
        | 'lastYear'
        | 'custom';
      customDates?: { startDate: string; endDate: string };
      format: 'csv' | 'xlsx';
      userId?: string;
    },
  ) {
    if (this.getMode() === 'direct') {
      const service = this.getService();
      return this.wrap(
        service.handleExportRequest({
          workspaceId,
          userId: data.userId || '',
          userEmail,
          dateRange: data.dateRange || 'thisMonth',
          customDates: data.customDates,
          format: data.format,
        }),
      );
    }
    throw new Error('RPC mode not implemented');
  }

  async downloadReport(
    workspaceId: string,
    data: {
      dateRange?:
        | 'last7days'
        | 'last30days'
        | 'thisMonth'
        | 'lastMonth'
        | 'thisYear'
        | 'lastYear'
        | 'custom';
      customDates?: { startDate: string; endDate: string };
      format: 'csv' | 'xlsx';
    },
  ) {
    if (this.getMode() === 'direct') {
      const service = this.getService();
      return this.wrap(
        service.generateReport(
          workspaceId,
          data.dateRange || 'thisMonth',
          data.customDates,
          data.format,
        ),
      );
    }
    throw new Error('RPC mode not implemented');
  }

  // --- Report History ---

  async createReportRequest(data: CreateReportRequest): Promise<string> {
    const db = this.getDb();
    const result = await db.query(
      `INSERT INTO report_requests (
        workspace_id, user_id, user_email, date_range,
        custom_start_date, custom_end_date, format, delivery_method,
        status, filename, file_size, error_message, generated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id`,
      [
        data.workspaceId,
        data.userId,
        data.userEmail,
        data.dateRange,
        data.customStartDate || null,
        data.customEndDate || null,
        data.format,
        data.deliveryMethod,
        data.status || 'pending',
        data.filename || null,
        data.fileSize || null,
        data.errorMessage || null,
        data.generatedAt || null,
      ],
    );
    return result.rows[0].id;
  }

  async updateReportRequest(
    id: string,
    data: Partial<CreateReportRequest & { status: string; errorMessage?: string }>,
  ): Promise<void> {
    const db = this.getDb();
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      status: 'status',
      filename: 'filename',
      fileSize: 'file_size',
      errorMessage: 'error_message',
      generatedAt: 'generated_at',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        fields.push(`${column} = $${paramIndex}`);
        values.push(data[key as keyof typeof data]);
        paramIndex++;
      }
    }

    if (fields.length === 0) return;

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    await db.query(
      `UPDATE report_requests SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values,
    );
  }

  async listReportRequests(params: ReportRequestListParams) {
    const db = this.getDb();
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const offset = (page - 1) * limit;
    const sortBy = params.sortBy || 'created_at';
    const sortOrder = params.sortOrder || 'desc';

    let whereClause = 'WHERE workspace_id = $1';
    const queryValues: any[] = [params.workspaceId];
    let paramIndex = 2;

    if (params.status) {
      whereClause += ` AND status = $${paramIndex}`;
      queryValues.push(params.status);
      paramIndex++;
    }

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM report_requests ${whereClause}`,
      queryValues,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const dataResult = await db.query(
      `SELECT id, workspace_id, user_id, user_email, date_range,
              custom_start_date, custom_end_date, format, delivery_method,
              status, filename, file_size, error_message, generated_at,
              created_at, updated_at
       FROM report_requests
       ${whereClause}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...queryValues, limit, offset],
    );

    const reports = dataResult.rows.map((row: any) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      userEmail: row.user_email,
      dateRange: row.date_range,
      customStartDate: row.custom_start_date,
      customEndDate: row.custom_end_date,
      format: row.format,
      deliveryMethod: row.delivery_method,
      status: row.status,
      filename: row.filename,
      fileSize: row.file_size,
      errorMessage: row.error_message,
      generatedAt: row.generated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return {
      reports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
