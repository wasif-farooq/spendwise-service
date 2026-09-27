import { Request, Response } from 'express';
import { ScheduledReportService } from '../services/ScheduledReportService';
import { CreateScheduledReport, UpdateScheduledReport } from '../models/ScheduledReport';

export class ScheduledReportController {
  constructor(private scheduledReportService: ScheduledReportService) {}

  private getUserId(req: Request): string {
    return (req as any).user?.userId || (req as any).user?.sub || (req as any).user?.id;
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const userEmail = (req as any).user?.email;
      const workspaceId = req.params.workspaceId;

      if (!userId || !userEmail) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { name, frequency, dayOfWeek, dayOfMonth, timeOfDay, format } = req.body as CreateScheduledReport;

      if (!name || !frequency) {
        res.status(400).json({ message: 'Missing required fields: name, frequency' });
        return;
      }

      if (!['weekly', 'monthly'].includes(frequency)) {
        res.status(400).json({ message: 'Invalid frequency. Must be weekly or monthly' });
        return;
      }

      if (format && !['csv', 'xlsx'].includes(format)) {
        res.status(400).json({ message: 'Invalid format. Must be csv or xlsx' });
        return;
      }

      if (frequency === 'weekly' && dayOfWeek !== undefined && (dayOfWeek < 0 || dayOfWeek > 6)) {
        res.status(400).json({ message: 'dayOfWeek must be between 0 (Sunday) and 6 (Saturday)' });
        return;
      }

      if (frequency === 'monthly' && dayOfMonth !== undefined && (dayOfMonth < 1 || dayOfMonth > 31)) {
        res.status(400).json({ message: 'dayOfMonth must be between 1 and 31' });
        return;
      }

      const result = await this.scheduledReportService.create({
        workspaceId,
        userId,
        userEmail,
        name,
        frequency,
        dayOfWeek,
        dayOfMonth,
        timeOfDay,
        format,
      });

      res.status(201).json(result);
    } catch (error: any) {
      console.error('[SCHEDULED-REPORT] Create error:', error);
      res.status(500).json({ message: error.message || 'Failed to create scheduled report' });
    }
  }

  async list(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const workspaceId = req.params.workspaceId;

      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const isActive = req.query.isActive !== undefined
        ? req.query.isActive === 'true'
        : undefined;

      const result = await this.scheduledReportService.list({
        workspaceId,
        page,
        limit,
        isActive,
      });

      res.json(result);
    } catch (error: any) {
      console.error('[SCHEDULED-REPORT] List error:', error);
      res.status(500).json({ message: error.message || 'Failed to list scheduled reports' });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const report = await this.scheduledReportService.getById(id);
      if (!report) {
        res.status(404).json({ message: 'Scheduled report not found' });
        return;
      }

      res.json(report);
    } catch (error: any) {
      console.error('[SCHEDULED-REPORT] Get error:', error);
      res.status(500).json({ message: error.message || 'Failed to get scheduled report' });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const updates = req.body as UpdateScheduledReport;

      if (updates.frequency && !['weekly', 'monthly'].includes(updates.frequency)) {
        res.status(400).json({ message: 'Invalid frequency. Must be weekly or monthly' });
        return;
      }

      if (updates.format && !['csv', 'xlsx'].includes(updates.format)) {
        res.status(400).json({ message: 'Invalid format. Must be csv or xlsx' });
        return;
      }

      const result = await this.scheduledReportService.update(id, updates);
      res.json(result);
    } catch (error: any) {
      console.error('[SCHEDULED-REPORT] Update error:', error);
      if (error.message === 'Scheduled report not found') {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || 'Failed to update scheduled report' });
      }
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const result = await this.scheduledReportService.delete(id);
      res.json(result);
    } catch (error: any) {
      console.error('[SCHEDULED-REPORT] Delete error:', error);
      if (error.message === 'Scheduled report not found') {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || 'Failed to delete scheduled report' });
      }
    }
  }

  async toggleActive(req: Request, res: Response): Promise<void> {
    try {
      const userId = this.getUserId(req);
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const { isActive } = req.body as { isActive: boolean };

      if (isActive === undefined) {
        res.status(400).json({ message: 'Missing required field: isActive' });
        return;
      }

      const result = await this.scheduledReportService.toggleActive(id, isActive);
      res.json(result);
    } catch (error: any) {
      console.error('[SCHEDULED-REPORT] Toggle error:', error);
      if (error.message === 'Scheduled report not found') {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || 'Failed to toggle scheduled report' });
      }
    }
  }
}
