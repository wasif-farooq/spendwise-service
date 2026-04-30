import { Request, Response } from 'express';
import { AnalyticsRequestRepository } from '../repositories/AnalyticsRequestRepository';
import { SubscriptionRequestRepository } from '@domains/subscription/repositories/SubscriptionRequestRepository';
import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';

interface DateFilters {
    startDate?: string;
    endDate?: string;
    preferredCurrency?: string;
}

export class AnalyticsController {
    constructor(
        private analyticsRequestRepository: AnalyticsRequestRepository,
        private subscriptionRequestRepository?: SubscriptionRequestRepository,
        private workspaceRequestRepository?: WorkspaceRequestRepository
    ) { }

    private getWorkspaceId(req: Request): string {
        return req.params.workspaceId;
    }

    private getUserId(req: Request): string {
        return (req as any).user?.userId || (req as any).user?.id || (req as any).user?.sub;
    }

    private async getOwnerId(workspaceId: string, userId: string): Promise<string> {
        if (!this.workspaceRequestRepository) return userId;
        const workspaceResult = await this.workspaceRequestRepository.getById(workspaceId, userId);
        return workspaceResult.data?.ownerId || userId;
    }

    private async getAnalyticsLimit(ownerId: string): Promise<number> {
        if (!this.subscriptionRequestRepository) return 30;
        try {
            const result = await this.subscriptionRequestRepository.getCurrentSubscription(ownerId);
            if (result.error || !result.data) return 30;
            const limits = result.data.limitsSnapshot;
            return limits?.analyticsHistoryDays || 30;
        } catch {
            return 30;
        }
    }

    private truncateDateRange(filters: DateFilters, maxDays: number): { filters: DateFilters; truncated: boolean; warning?: string } {
        if (!filters.startDate && !filters.endDate) {
            return { filters, truncated: false };
        }

        const now = new Date();
        let startDate: Date;
        let endDate: Date;

        if (filters.startDate && filters.endDate) {
            startDate = new Date(filters.startDate);
            endDate = new Date(filters.endDate);
        } else if (filters.startDate) {
            startDate = new Date(filters.startDate);
            endDate = now;
        } else if (filters.endDate) {
            endDate = new Date(filters.endDate);
            startDate = new Date(endDate.getTime() - maxDays * 24 * 60 * 60 * 1000);
        } else {
            return { filters, truncated: false };
        }

        const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

        if (maxDays === -1 || diffDays <= maxDays) {
            return { filters, truncated: false };
        }

        const truncatedStartDate = new Date(endDate.getTime() - maxDays * 24 * 60 * 60 * 1000);
        const truncatedFilters = {
            ...filters,
            startDate: truncatedStartDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
        };

        return {
            filters: truncatedFilters,
            truncated: true,
            warning: `Data truncated to last ${maxDays} days. Upgrade to Pro for full analytics.`
        };
    }

    private addTruncationWarning(response: any, truncated: boolean, warning: string): any {
        if (!truncated) return response;
        return {
            ...response,
            _warning: warning,
            _truncated: true,
        };
    }

    async getOverview(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);
            const { period = 'month', startDate, endDate, preferredCurrency } = req.query;

            if (!workspaceId) {
                return res.status(404).json({ message: 'Workspace not found' });
            }

            const ownerId = await this.getOwnerId(workspaceId, userId);
            const maxDays = await this.getAnalyticsLimit(ownerId);

            const filters = {
                startDate: startDate as string,
                endDate: endDate as string,
                preferredCurrency: preferredCurrency as string,
            };

            const { filters: truncatedFilters, truncated, warning } = this.truncateDateRange(filters, maxDays);

            const result = await this.analyticsRequestRepository.getOverview(workspaceId, userId, truncatedFilters);

            if (result.error) {
                throw new Error(result.error);
            }

            const response = this.addTruncationWarning(result.data, truncated, warning!);
            res.json(response);
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

            const ownerId = await this.getOwnerId(workspaceId, userId);
            const maxDays = await this.getAnalyticsLimit(ownerId);

            const filters = {
                startDate: startDate as string,
                endDate: endDate as string,
                preferredCurrency: preferredCurrency as string,
            };

            const { filters: truncatedFilters, truncated, warning } = this.truncateDateRange(filters, maxDays);

            const result = await this.analyticsRequestRepository.getCategoryTrends(workspaceId, userId, truncatedFilters);

            if (result.error) {
                throw new Error(result.error);
            }

            const response = this.addTruncationWarning(result.data, truncated, warning!);
            res.json(response);
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

            const ownerId = await this.getOwnerId(workspaceId, userId);
            const maxDays = await this.getAnalyticsLimit(ownerId);

            const filters = {
                startDate: startDate as string,
                endDate: endDate as string,
            };

            const { filters: truncatedFilters, truncated, warning } = this.truncateDateRange(filters, maxDays);

            const result = await this.analyticsRequestRepository.getMonthlyComparison(workspaceId, userId, parseInt(months as string));

            if (result.error) {
                throw new Error(result.error);
            }

            const response = this.addTruncationWarning(result.data, truncated, warning!);
            res.json(response);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getSpendingTrend(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);
            const { period = 'month', startDate, endDate } = req.query;

            if (!workspaceId) {
                return res.status(404).json({ message: 'Workspace not found' });
            }

            const ownerId = await this.getOwnerId(workspaceId, userId);
            const maxDays = await this.getAnalyticsLimit(ownerId);

            const filters = {
                startDate: startDate as string,
                endDate: endDate as string,
            };

            const { filters: truncatedFilters, truncated, warning } = this.truncateDateRange(filters, maxDays);

            const result = await this.analyticsRequestRepository.getSpendingTrend(workspaceId, period as string, truncatedFilters);

            if (result.error) {
                throw new Error(result.error);
            }

            const response = this.addTruncationWarning(result.data, truncated, warning!);
            res.json(response);
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

            const ownerId = await this.getOwnerId(workspaceId, userId);
            const maxDays = await this.getAnalyticsLimit(ownerId);

            const filters = {
                startDate: startDate as string,
                endDate: endDate as string,
            };

            const { filters: truncatedFilters, truncated, warning } = this.truncateDateRange(filters, maxDays);

            const result = await this.analyticsRequestRepository.getTopMerchants(workspaceId, userId, parseInt(limit as string));

            if (result.error) {
                throw new Error(result.error);
            }

            const response = this.addTruncationWarning(result.data, truncated, warning!);
            res.json(response);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }
}