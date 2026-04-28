import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { CategoryRepository } from '@domains/categories/repositories/CategoryRepository';
import { resolveDateRange, DateRangePreset, CustomDateRange } from '../types';

export interface ExpenseReportData {
  period: {
    startDate: string;
    endDate: string;
  };
  generatedAt: string;
  summary: {
    totalExpenses: number;
    transactionCount: number;
    averageTransaction: number;
    previousPeriodChange: number;
  };
  byCategory: Array<{ category: string; amount: number; percentage: number }>;
  byMerchant: Array<{ merchant: string; amount: number; count: number }>;
  topExpenses: Array<{ description: string; amount: number; date: string; category: string }>;
  byAccount: Array<{ accountName: string; amount: number }>;
}

export class ExpenseReportGenerator {
  constructor(
    private transactionRepo: TransactionRepository,
    private categoryRepo: CategoryRepository
  ) {}

  async generate(
    workspaceId: string,
    dateRange: DateRangePreset,
    customDates?: CustomDateRange
  ): Promise<ExpenseReportData> {
    const { startDate, endDate } = resolveDateRange(dateRange, customDates);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get workspace stats for the period
    const stats = await this.transactionRepo.getWorkspaceStats(workspaceId, startDateStr, endDateStr);
    
    // Get account-level stats
    const accountStats = await this.transactionRepo.getWorkspaceAccountStats(workspaceId, startDateStr, endDateStr);
    
    // Get all transactions for the period (for category/merchant breakdown)
    const transactionsResult = await this.transactionRepo.findByWorkspaceId(workspaceId, {
      startDate: startDateStr,
      endDate: endDateStr,
      limit: 10000
    });

    // Filter only expenses
    const expenses = (transactionsResult.transactions || []).filter((t: any) => t.type === 'expense');

    // Calculate by category
    const categoryMap = new Map<string, number>();
    for (const tx of expenses) {
      const category = tx.categoryName || 'Uncategorized';
      categoryMap.set(category, (categoryMap.get(category) || 0) + tx.amount);
    }

    const totalExpenses = stats.totalExpense || 0;
    const byCategory = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    // Calculate by merchant (using description as merchant proxy)
    const merchantMap = new Map<string, { amount: number; count: number }>();
    for (const tx of expenses) {
      const merchant = tx.description || 'Unknown';
      const current = merchantMap.get(merchant) || { amount: 0, count: 0 };
      merchantMap.set(merchant, {
        amount: current.amount + tx.amount,
        count: current.count + 1
      });
    }

    const byMerchant = Array.from(merchantMap.entries())
      .map(([merchant, data]) => ({
        merchant,
        amount: data.amount,
        count: data.count
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 20);

    // Top expenses (largest transactions)
    const topExpenses = expenses
      .sort((a: any, b: any) => b.amount - a.amount)
      .slice(0, 10)
      .map((tx: any) => ({
        description: tx.description || 'No description',
        amount: tx.amount,
        date: tx.date instanceof Date ? tx.date.toISOString().split('T')[0] : String(tx.date),
        category: tx.categoryName || 'Uncategorized'
      }));

    // By account
    const byAccount = accountStats
      .filter(a => a.totalExpense > 0)
      .map(a => ({
        accountName: a.accountName,
        amount: a.totalExpense
      }))
      .sort((a, b) => b.amount - a.amount);

    // Calculate previous period for comparison
    const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const prevStartDate = new Date(startDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const prevEndDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
    
    let previousPeriodChange = 0;
    try {
      const prevStats = await this.transactionRepo.getWorkspaceStats(
        workspaceId,
        prevStartDate.toISOString().split('T')[0],
        prevEndDate.toISOString().split('T')[0]
      );
      const prevExpenses = prevStats.totalExpense || 0;
      if (prevExpenses > 0 && totalExpenses > 0) {
        previousPeriodChange = ((totalExpenses - prevExpenses) / prevExpenses) * 100;
      }
    } catch {
      // If previous period calculation fails, just set to 0
    }

    return {
      period: {
        startDate: startDateStr,
        endDate: endDateStr
      },
      generatedAt: new Date().toISOString(),
      summary: {
        totalExpenses,
        transactionCount: expenses.length,
        averageTransaction: expenses.length > 0 ? totalExpenses / expenses.length : 0,
        previousPeriodChange
      },
      byCategory,
      byMerchant,
      topExpenses,
      byAccount
    };
  }
}