import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AnalyticsService } from '@domains/analytics/services/AnalyticsService';
import { AccountRepository } from '@domains/accounts/repositories/AccountRepository';
import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

const WorkspaceIdParamSchema = z.object({
    workspaceId: z.string().uuid(),
});

class AIController {
    private analyticsService: AnalyticsService;
    private accountRepo: AccountRepository;
    private transactionRepo: TransactionRepository;

    constructor() {
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        this.analyticsService = new AnalyticsService();
        this.accountRepo = new AccountRepository(db);
        this.transactionRepo = new TransactionRepository(db);
    }

    private getWorkspaceId(req: Request): string {
        return req.params.workspaceId;
    }

    async getInsights(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            if (!workspaceId) {
                return res.status(404).json({ message: 'Workspace not found' });
            }

            const accounts = await this.accountRepo.findByOrganizationId(workspaceId);
            const overview = await this.analyticsService.getOverview(workspaceId, 'month');
            const categoryTrends = await this.analyticsService.getCategoryTrends(workspaceId, 1);

            const insights: Array<{ type: string; title: string; description: string; severity: string }> = [];

            if (categoryTrends.length > 0) {
                const topCategory = categoryTrends[0];
                insights.push({
                    type: 'spending',
                    title: `High ${topCategory.category} Spending`,
                    description: `You've spent ${topCategory.amount.toFixed(2)} on ${topCategory.category} this month.`,
                    severity: 'warning'
                });
            }

            if (overview.netCashFlow < 0) {
                insights.push({
                    type: 'cashflow',
                    title: 'Negative Cash Flow',
                    description: `You spent ${Math.abs(overview.netCashFlow).toFixed(2)} more than you earned this month.`,
                    severity: 'alert'
                });
            } else if (overview.netCashFlow > 0) {
                insights.push({
                    type: 'savings',
                    title: 'Great Savings Rate!',
                    description: `You saved ${overview.netCashFlow.toFixed(2)} this month.`,
                    severity: 'success'
                });
            }

            for (const account of accounts) {
                if (account.balance < 100) {
                    insights.push({
                        type: 'balance',
                        title: `Low Balance Alert: ${account.name}`,
                        description: `Your ${account.name} account has only ${account.balance.toFixed(2)} ${account.currency}.`,
                        severity: 'warning'
                    });
                    break;
                }
            }

            if (overview.totalExpense === 0 && overview.totalIncome > 0) {
                insights.push({
                    type: 'activity',
                    title: 'No Expenses Recorded',
                    description: 'You haven\'t recorded any expenses this month.',
                    severity: 'info'
                });
            }

            res.json({ insights });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getRecommendations(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            if (!workspaceId) {
                return res.status(404).json({ message: 'Workspace not found' });
            }

            const overview = await this.analyticsService.getOverview(workspaceId, 'month');
            const categoryTrends = await this.analyticsService.getCategoryTrends(workspaceId, 1);

            const recommendations: Array<{ category: string; current: number; recommended: number; tip: string }> = [];

            const totalExpense = overview.totalExpense || 0;
            const totalIncome = overview.totalIncome || 1;

            for (const cat of categoryTrends.slice(0, 3)) {
                const percentage = (cat.amount / totalExpense) * 100;
                const recommended = (totalIncome * 0.3);
                
                recommendations.push({
                    category: cat.category,
                    current: cat.amount,
                    recommended: Math.round(recommended * 100) / 100,
                    tip: percentage > 30 
                        ? `Reduce spending by ${Math.round((cat.amount - recommended) * 100) / 100}`
                        : `Great job managing ${cat.category} spending!`
                });
            }

            if (recommendations.length === 0) {
                recommendations.push({
                    category: 'General',
                    current: 0,
                    recommended: totalIncome * 0.5,
                    tip: 'Start tracking expenses to get personalized recommendations.'
                });
            }

            res.json({ recommendations });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getAnalysis(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            if (!workspaceId) {
                return res.status(404).json({ message: 'Workspace not found' });
            }

            const overview = await this.analyticsService.getOverview(workspaceId, 'month');
            const categoryTrends = await this.analyticsService.getCategoryTrends(workspaceId, 1);

            const analysis = {
                monthOverview: {
                    totalIncome: overview.totalIncome,
                    totalExpense: overview.totalExpense,
                    netCashFlow: overview.netCashFlow,
                    savingsRate: overview.totalIncome > 0 
                        ? ((overview.netCashFlow / overview.totalIncome) * 100).toFixed(1) + '%'
                        : '0%'
                },
                topCategories: categoryTrends.slice(0, 5).map((c: any) => ({
                    name: c.category,
                    amount: c.amount,
                    percentage: overview.totalExpense > 0 
                        ? ((c.amount / overview.totalExpense) * 100).toFixed(1) + '%'
                        : '0%'
                })),
                advice: this.generateAdvice(overview, categoryTrends)
            };

            res.json(analysis);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    private generateAdvice(overview: any, categoryTrends: any[]): string[] {
        const advice: string[] = [];

        if (overview.netCashFlow > 0) {
            const savingsRate = (overview.netCashFlow / overview.totalIncome) * 100;
            if (savingsRate >= 20) {
                advice.push('Excellent! You\'re saving more than 20% of your income.');
            } else if (savingsRate >= 10) {
                advice.push('Good savings rate. Try to increase it to 20% for better financial health.');
            } else {
                advice.push('Consider reducing expenses to save at least 10-20% of your income.');
            }
        } else {
            advice.push('You\'re spending more than you earn. Review your expenses immediately.');
        }

        if (categoryTrends.length > 0) {
            const topCategory = categoryTrends[0];
            advice.push(`Your highest spending is in ${topCategory.category}.`);
        }

        return advice;
    }
}

const router = Router();
const controller = new AIController();

router.get('/:workspaceId/ai/insights', controller.getInsights.bind(controller));
router.get('/:workspaceId/ai/recommendations', controller.getRecommendations.bind(controller));
router.get('/:workspaceId/ai/analysis', controller.getAnalysis.bind(controller));

export default router;
