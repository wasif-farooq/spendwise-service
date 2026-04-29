import { Request, Response } from 'express';
import { AnalyticsRequestRepository } from '../repositories/AnalyticsRequestRepository';

export class AnalyticsController {
    constructor(private analyticsRequestRepository: AnalyticsRequestRepository) { }

    private getWorkspaceId(req: Request): string {
        return req.params.workspaceId;
    }

    private getUserId(req: Request): string {
        return (req as any).user?.userId || (req as any).user?.id || (req as any).user?.sub;
    }

    async getOverview(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);
            const { period = 'month', startDate, endDate, preferredCurrency } = req.query;

            if (!workspaceId) {
                return res.status(404).json({ message: 'Workspace not found' });
            }

            const filters = {
                startDate: startDate as string,
                endDate: endDate as string,
                preferredCurrency: preferredCurrency as string,
            };

            const result = await this.analyticsRequestRepository.getOverview(workspaceId, userId, filters);

            if (result.error) {
                throw new Error(result.error);
            }

            res.json(result.data);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getCategoryTrends(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);
            const { months = 6, startDate, endDate, preferredCurrency } = req.query;

            if (!workspaceId) {
                return res.status(404).json({ message: 'Workspace not found' });
            }

            const filters = {
                startDate: startDate as string,
                endDate: endDate as string,
                preferredCurrency: preferredCurrency as string,
            };

            const result = await this.analyticsRequestRepository.getCategoryTrends(workspaceId, userId, filters);

            if (result.error) {
                throw new Error(result.error);
            }

            res.json(result.data);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getMonthlyComparison(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);
            const { months = 12, startDate, endDate } = req.query;

            if (!workspaceId) {
                return res.status(404).json({ message: 'Workspace not found' });
            }

            const filters = {
                startDate: startDate as string,
                endDate: endDate as string,
            };

            const result = await this.analyticsRequestRepository.getMonthlyComparison(workspaceId, userId, parseInt(months as string));

            if (result.error) {
                throw new Error(result.error);
            }

            res.json(result.data);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getSpendingTrend(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const { period = 'month', startDate, endDate } = req.query;

            if (!workspaceId) {
                return res.status(404).json({ message: 'Workspace not found' });
            }

            const filters = {
                startDate: startDate as string,
                endDate: endDate as string,
            };

            const result = await this.analyticsRequestRepository.getSpendingTrend(workspaceId, period as string, filters);

            if (result.error) {
                throw new Error(result.error);
            }

            res.json(result.data);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getTopMerchants(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);
            const { period = 'month', limit = 10, startDate, endDate } = req.query;

            if (!workspaceId) {
                return res.status(404).json({ message: 'Workspace not found' });
            }

            const filters = {
                startDate: startDate as string,
                endDate: endDate as string,
            };

            const result = await this.analyticsRequestRepository.getTopMerchants(workspaceId, userId, parseInt(limit as string));

            if (result.error) {
                throw new Error(result.error);
            }

            res.json(result.data);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }
}