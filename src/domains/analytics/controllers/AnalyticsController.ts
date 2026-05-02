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
        const now = new Date();
        const maxDate = now.toISOString().split('T')[0]; // Today's date
        
        // If maxDays is -1 (unlimited), use defaults or provided values
        if (maxDays === -1) {
            const defaultFilters = { ...filters };
            
            // Default to 1 year if no dates provided
            if (!defaultFilters.startDate) {
                const oneYearAgo = new Date(now);
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                defaultFilters.startDate = oneYearAgo.toISOString().split('T')[0];
            }
            if (!defaultFilters.endDate) {
                defaultFilters.endDate = maxDate;
            }
            
            return { filters: defaultFilters, truncated: false };
        }
        
        // Apply subscription limits for Free/Starter/Pro
        if (maxDays > 0) {
            const minDate = new Date(now.getTime() - maxDays * 24 * 60 * 60 * 1000);
            const minDateStr = minDate.toISOString().split('T')[0];
            let truncated = false;
            
            const limitedFilters = { ...filters };
            
            // Handle startDate
            if (filters.startDate && filters.startDate < minDateStr) {
                // User selected date beyond their limit - truncate it
                limitedFilters.startDate = minDateStr;
                truncated = true;
            } else if (!filters.startDate) {
                // No startDate provided - default to limit
                limitedFilters.startDate = minDateStr;
            }
            
            // Handle endDate
            if (filters.endDate && filters.endDate > maxDate) {
                // User selected future date - limit to today
                limitedFilters.endDate = maxDate;
                truncated = true;
            } else if (!filters.endDate) {
                // No endDate provided - default to today
                limitedFilters.endDate = maxDate;
            }
            
            const warning = truncated 
                ? `Date range limited to ${maxDays} days based on your subscription plan.`
                : undefined;
                
            return { 
                filters: limitedFilters, 
                truncated,
                warning
            };
        }
        
        // Fallback: if maxDays is 0 or invalid, default to 30 days
        const minDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const defaultFilters = {
            startDate: minDate.toISOString().split('T')[0],
            endDate: maxDate,
        };
        
        return { filters: defaultFilters, truncated: false };
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

    async getComparison(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);
            const { period = 'month', months = 12, startDate, endDate } = req.query;

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

            const result = await this.analyticsRequestRepository.getComparison(
                workspaceId,
                userId,
                period as string,
                parseInt(months as string),
                truncatedFilters
            );

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