import { Request, Response } from 'express';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { AnalyticsService } from '../services/AnalyticsService';

export class AnalyticsController {
    private get analyticsService(): AnalyticsService {
        return Container.getInstance().resolve<AnalyticsService>(TOKENS.AnalyticsService);
    }

    private getWorkspaceId(req: Request): string {
        return req.params.workspaceId;
    }

    async getOverview(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const { period = 'month' } = req.query;

            if (!workspaceId) {
                return res.status(404).json({ message: 'Workspace not found' });
            }

            const overview = await this.analyticsService.getOverview(workspaceId, period as string);
            res.json(overview);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getCategoryTrends(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const { months = 6 } = req.query;

            if (!workspaceId) {
                return res.status(404).json({ message: 'Workspace not found' });
            }

            const trends = await this.analyticsService.getCategoryTrends(workspaceId, parseInt(months as string));
            res.json(trends);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getMonthlyComparison(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const { months = 12 } = req.query;

            if (!workspaceId) {
                return res.status(404).json({ message: 'Workspace not found' });
            }

            const comparison = await this.analyticsService.getMonthlyComparison(workspaceId, parseInt(months as string));
            res.json(comparison);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getSpendingTrend(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const { period = 'month', accountId } = req.query;

            if (!workspaceId) {
                return res.status(404).json({ message: 'Workspace not found' });
            }

            const trend = await this.analyticsService.getSpendingTrend(workspaceId, period as string, accountId as string | undefined);
            res.json(trend);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getTopMerchants(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const { period = 'month', limit = 10 } = req.query;

            if (!workspaceId) {
                return res.status(404).json({ message: 'Workspace not found' });
            }

            const merchants = await this.analyticsService.getTopMerchants(workspaceId, period as string, parseInt(limit as string));
            res.json(merchants);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }
}
