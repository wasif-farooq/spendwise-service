import { Request, Response } from 'express';
import { ReportRequestRepository } from '@domains/repositories/ReportRequestRepository';
import { DateRangePreset, CustomDateRange } from '../types';

export class ReportController {
    constructor(private reportRequestRepository: ReportRequestRepository) { }

    private getUserId(req: Request): string {
        return (req as any).user?.userId || (req as any).user?.sub || (req as any).user?.id;
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

            const result = await this.reportRequestRepository.exportReport(workspaceId, userEmail, {
                dateRange,
                customDates,
                format
            });

            if (result.error) {
                throw new Error(result.error);
            }

            console.log(`[REPORT] Export request processed for workspace ${workspaceId}, user ${userEmail}`);

            res.json({
                message: 'Report being generated. Will be sent to your email.'
            });
        } catch (error: any) {
            console.error('[REPORT] Export error:', error);
            res.status(500).json({ message: error.message || 'Failed to process export request' });
        }
    }
}