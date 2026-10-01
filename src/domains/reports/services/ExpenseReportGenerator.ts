import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { CategoryRepository } from '@domains/categories/repositories/CategoryRepository';
import { RateLookup, TotalsConverter } from '@domains/currencies/TotalsConverter';
import { roundAmount } from '@domains/currencies/currencies';
import { resolveDateRange, DateRangePreset, CustomDateRange } from '../types';

export interface ExpenseReportData {
  period: {
    startDate: string;
    endDate: string;
  };
  generatedAt: string;
  /** Every total and breakdown amount is in this currency (the owner's Preferences currency). */
  currency: string;
  /** Currencies with no rate to `currency`: left out of the totals rather than counted at 1. */
  unconvertedCurrencies: string[];
  summary: {
    totalExpenses: number;
    transactionCount: number;
    averageTransaction: number;
    previousPeriodChange: number;
  };
  byCategory: Array<{ category: string; amount: number; percentage: number }>;
  byMerchant: Array<{ merchant: string; amount: number; count: number }>;
  /** Amounts here stay in each transaction's own currency. */
  topExpenses: Array<{
    description: string;
    amount: number;
    currency?: string;
    date: string;
    category: string;
  }>;
  byAccount: Array<{ accountName: string; amount: number }>;
}

export class ExpenseReportGenerator {
  constructor(
    private transactionRepo: TransactionRepository,
    private categoryRepo: CategoryRepository,
    private rateOf?: RateLookup,
  ) {}

  async generate(
    workspaceId: string,
    dateRange: DateRangePreset,
    customDates?: CustomDateRange,
  ): Promise<ExpenseReportData> {
    const { startDate, endDate } = resolveDateRange(dateRange, customDates);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const target = (
      (await this.transactionRepo.getWorkspaceOwnerCurrency(workspaceId).catch(() => null)) || 'USD'
    ).toUpperCase();
    // One converter for the whole report, so each rate is looked up once.
    const converter = new TotalsConverter(target, this.rateOf);
    const round = (amount: number) => roundAmount(amount, target);

    const totalExpenses = round(
      await this.convertedExpenseTotal(converter, workspaceId, startDateStr, endDateStr),
    );

    // Get account-level stats
    const accountStats = await this.transactionRepo.getWorkspaceAccountStats(
      workspaceId,
      startDateStr,
      endDateStr,
    );

    // Get all transactions for the period (for category/merchant breakdown)
    const transactionsResult = await this.transactionRepo.findByWorkspaceId(workspaceId, {
      startDate: startDateStr,
      endDate: endDateStr,
      limit: 10000,
    });

    // Filter only expenses, each with its amount in the report currency (null: no rate)
    const expenses: Array<{ tx: any; converted: number | null }> = [];
    for (const tx of transactionsResult.transactions || []) {
      if ((tx as any).type !== 'expense') continue;
      expenses.push({ tx, converted: await converter.convert(tx.amount, (tx as any).currency) });
    }

    // Calculate by category
    const categoryMap = new Map<string, number>();
    for (const { tx, converted } of expenses) {
      if (converted === null) continue;
      const category = tx.categoryName || 'Uncategorized';
      categoryMap.set(category, (categoryMap.get(category) || 0) + converted);
    }

    const byCategory = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({
        category,
        amount: round(amount),
        percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Calculate by merchant (using description as merchant proxy)
    const merchantMap = new Map<string, { amount: number; count: number }>();
    for (const { tx, converted } of expenses) {
      if (converted === null) continue;
      const merchant = tx.description || 'Unknown';
      const current = merchantMap.get(merchant) || { amount: 0, count: 0 };
      merchantMap.set(merchant, {
        amount: current.amount + converted,
        count: current.count + 1,
      });
    }

    const byMerchant = Array.from(merchantMap.entries())
      .map(([merchant, data]) => ({
        merchant,
        amount: round(data.amount),
        count: data.count,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 20);

    // Top expenses (largest in the report currency; shown in their own currency)
    const topExpenses = expenses
      .filter((e) => e.converted !== null)
      .sort((a, b) => (b.converted as number) - (a.converted as number))
      .slice(0, 10)
      .map(({ tx }) => ({
        description: tx.description || 'No description',
        amount: tx.amount,
        currency: tx.currency,
        date: tx.date instanceof Date ? tx.date.toISOString().split('T')[0] : String(tx.date),
        category: tx.categoryName || 'Uncategorized',
      }));

    // By account (each row is in the account's currency)
    const byAccount: ExpenseReportData['byAccount'] = [];
    for (const a of accountStats) {
      if (!(a.totalExpense > 0)) continue;
      const amount = await converter.convert(a.totalExpense, a.currency);
      if (amount !== null) byAccount.push({ accountName: a.accountName, amount: round(amount) });
    }
    byAccount.sort((a, b) => b.amount - a.amount);

    // Before the comparison below, which may meet other currencies.
    const unconvertedCurrencies = converter.unconvertedCurrencies();
    const convertedCount = expenses.filter((e) => e.converted !== null).length;

    // Calculate previous period for comparison
    const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const prevStartDate = new Date(startDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const prevEndDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);

    let previousPeriodChange = 0;
    try {
      const prevExpenses = await this.convertedExpenseTotal(
        converter,
        workspaceId,
        prevStartDate.toISOString().split('T')[0],
        prevEndDate.toISOString().split('T')[0],
      );
      if (prevExpenses > 0 && totalExpenses > 0) {
        previousPeriodChange = ((totalExpenses - prevExpenses) / prevExpenses) * 100;
      }
    } catch {
      // If previous period calculation fails, just set to 0
    }

    return {
      period: {
        startDate: startDateStr,
        endDate: endDateStr,
      },
      generatedAt: new Date().toISOString(),
      currency: target,
      unconvertedCurrencies,
      summary: {
        totalExpenses,
        transactionCount: expenses.length,
        averageTransaction: convertedCount > 0 ? round(totalExpenses / convertedCount) : 0,
        previousPeriodChange,
      },
      byCategory,
      byMerchant,
      topExpenses,
      byAccount,
    };
  }

  /** Expense total for a period, each currency converted to the report currency. */
  private async convertedExpenseTotal(
    converter: TotalsConverter,
    workspaceId: string,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const rows = await this.transactionRepo.getWorkspaceStatsByCurrency(
      workspaceId,
      startDate,
      endDate,
    );
    let total = 0;
    for (const row of rows) {
      const expense = await converter.convert(row.totalExpense, row.currency);
      if (expense !== null) total += expense;
    }
    return total;
  }
}
