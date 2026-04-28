import { Request, Response } from 'express';
import { ExportReportRequest, DateRangePreset, CustomDateRange } from '../types';

interface KafkaClient {
  publish(topic: string, message: any): Promise<void>;
}

export class ReportController {
  private kafkaClient: KafkaClient;

  constructor(kafkaClient: KafkaClient) {
    this.kafkaClient = kafkaClient;
  }

  async exportReport(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.userId || (req as any).user?.sub || (req as any).user?.id;
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

      // Validate format
      if (!['csv', 'xlsx'].includes(format)) {
        res.status(400).json({ message: 'Invalid format. Must be csv or xlsx' });
        return;
      }

      // Validate custom dates if custom range is selected
      if (dateRange === 'custom' && (!customDates?.startDate || !customDates?.endDate)) {
        res.status(400).json({ message: 'Custom date range requires startDate and endDate' });
        return;
      }

      // Publish to Kafka for async processing
      const message: ExportReportRequest = {
        workspaceId,
        userId,
        userEmail,
        dateRange,
        customDates,
        format
      };

      await this.kafkaClient.publish('reports.export', message);

      console.log(`[REPORT] Export request queued for workspace ${workspaceId}, user ${userEmail}`);

      res.json({
        message: 'Report being generated. Will be sent to your email.'
      });
    } catch (error: any) {
      console.error('[REPORT] Export error:', error);
      res.status(500).json({ message: error.message || 'Failed to process export request' });
    }
  }
}