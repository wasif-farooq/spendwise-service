import { Request, Response } from 'express';
import { ReportRequestRepository } from '@domains/repositories/ReportRequestRepository';
import { DateRangePreset, CustomDateRange } from '../types';

export class ReportController {
  constructor(private reportRequestRepository: ReportRequestRepository) {}

  private getUserId(req: Request): string {
    return (req as any).user?.userId || (req as any).user?.sub || (req as any).user?.id;
  }

  async listReports(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const workspaceId = req.params.workspaceId;

      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string | undefined;
      const sortBy = (req.query.sortBy as 'created_at' | 'generated_at') || 'created_at';
      const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

      const result = await this.reportRequestRepository.listReportRequests({
        workspaceId,
        page,
        limit,
        status,
        sortBy,
        sortOrder,
      });

      res.json(result);
    } catch (error: any) {
      console.error('[REPORT] List error:', error);
      res.status(500).json({ message: error.message || 'Failed to list reports' });
    }
  }

  async exportReport(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const userEmail = (req as any).user?.email;
      const workspaceId = req.params.workspaceId;

      if (!userId || !userEmail) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { dateRange, customDates, format } = req.body as {
        dateRange: DateRangePreset;
        customDates?: CustomDateRange;
        format: 'csv' | 'xlsx';
      };

      if (!dateRange || !format) {
        res.status(400).json({ message: 'Missing required fields: dateRange, format' });
        return;
      }

      if (!['csv', 'xlsx'].includes(format)) {
        res.status(400).json({ message: 'Invalid format. Must be csv or xlsx' });
        return;
      }

      if (dateRange === 'custom' && (!customDates?.startDate || !customDates?.endDate)) {
        res.status(400).json({ message: 'Custom date range requires startDate and endDate' });
        return;
      }

      // Create report request record
      const reportId = await this.reportRequestRepository.createReportRequest({
        workspaceId,
        userId,
        userEmail,
        dateRange,
        customStartDate: customDates?.startDate,
        customEndDate: customDates?.endDate,
        format,
        deliveryMethod: 'email',
        status: 'processing',
      });

      try {
        const result = await this.reportRequestRepository.exportReport(workspaceId, userEmail, {
          dateRange,
          customDates,
          format,
        });

        if (result.error) {
          throw new Error(result.error);
        }

        await this.reportRequestRepository.updateReportRequest(reportId, {
          status: 'completed',
          generatedAt: new Date(),
        });

        console.log(
          `[REPORT] Export request processed for workspace ${workspaceId}, user ${userEmail}`,
        );

        res.json({
          message: 'Report being generated. Will be sent to your email.',
        });
      } catch (error: any) {
        await this.reportRequestRepository.updateReportRequest(reportId, {
          status: 'failed',
          errorMessage: error.message || 'Export failed',
        });
        throw error;
      }
    } catch (error: any) {
      console.error('[REPORT] Export error:', error);
      res.status(500).json({ message: error.message || 'Failed to process export request' });
    }
  }

  async downloadReport(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const workspaceId = req.params.workspaceId;

      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { dateRange, customDates, format } = req.query as {
        dateRange: DateRangePreset;
        customDates?: string;
        format?: 'csv' | 'xlsx';
      };

      if (!dateRange || !format) {
        res.status(400).json({ message: 'Missing required query params: dateRange, format' });
        return;
      }

      if (!['csv', 'xlsx'].includes(format)) {
        res.status(400).json({ message: 'Invalid format. Must be csv or xlsx' });
        return;
      }

      let parsedCustomDates: CustomDateRange | undefined;
      if (dateRange === 'custom') {
        if (!customDates) {
          res.status(400).json({ message: 'Custom date range requires customDates param' });
          return;
        }
        parsedCustomDates = JSON.parse(customDates);
      }

      // Create report request record
      const reportId = await this.reportRequestRepository.createReportRequest({
        workspaceId,
        userId,
        userEmail: (req as any).user?.email || '',
        dateRange,
        customStartDate: parsedCustomDates?.startDate,
        customEndDate: parsedCustomDates?.endDate,
        format,
        deliveryMethod: 'download',
        status: 'processing',
      });

      try {
        const result = await this.reportRequestRepository.downloadReport(workspaceId, {
          dateRange,
          customDates: parsedCustomDates,
          format,
        });

        if (result.error) {
          throw new Error(result.error);
        }

        const { buffer, filename, contentType } = result.data;

        await this.reportRequestRepository.updateReportRequest(reportId, {
          status: 'completed',
          filename,
          fileSize: buffer.length,
          generatedAt: new Date(),
        });

        console.log(
          `[REPORT] Download served for workspace ${workspaceId}, user ${userId}`,
        );

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
      } catch (error: any) {
        await this.reportRequestRepository.updateReportRequest(reportId, {
          status: 'failed',
          errorMessage: error.message || 'Download failed',
        });
        throw error;
      }
    } catch (error: any) {
      console.error('[REPORT] Download error:', error);
      res.status(500).json({ message: error.message || 'Failed to generate report' });
    }
  }
}
