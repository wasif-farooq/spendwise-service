import { DatabaseFacade } from '@facades/DatabaseFacade';
import { ExchangeRateService } from '@domains/exchange-rates/services/ExchangeRateService';
import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { AccountRepository } from '@domains/accounts/repositories/AccountRepository';

export interface AnalyticsOverview {
    monthlyIncome: number;
    monthlyExpenses: number;
    totalBalance: number;
    savingsRate: number;
    accountsCount: number;
    transactionsCount: number;
    topCategory: string | null;
    biggestExpense: number;
    periodComparison: {
        incomeChange: number;
        expenseChange: number;
    };
}

export interface CategoryTrend {
    category: string;
    categoryId?: string;
    amount: number;
    percentage: number;
    trend: 'up' | 'down' | 'stable';
    transactionCount: number;
}

export interface MonthlyComparison {
    period: string;
    periodLabel: string;
    income: number;
    expense: number;
    savings: number;
}

export interface SpendingTrend {
    period: string;
    income: number;
    expense: number;
    balance: number;
}

export interface TopMerchant {
    merchant: string;
    amount: number;
    transactionCount: number;
    category: string;
    lastTransaction: string;
}

export interface AnalyticsFilters {
    accounts?: string[];
    categories?: string[];
    startDate?: string;
    endDate?: string;
    preferredCurrency?: string;
}

export class AnalyticsService {
    private db: DatabaseFacade;
    private exchangeRateService: ExchangeRateService;
    private transactionRepo: TransactionRepository;
    private accountRepo: AccountRepository;

    constructor(
        db: DatabaseFacade,
        transactionRepo: TransactionRepository,
        accountRepo: AccountRepository,
        exchangeRateService: ExchangeRateService
    ) {
        this.db = db;
        this.transactionRepo = transactionRepo;
        this.accountRepo = accountRepo;
        this.exchangeRateService = exchangeRateService;
    }

    private async getUserPreferredCurrency(userId?: string, workspaceId?: string): Promise<string> {
        try {
            // First try to get from workspace owner
            if (workspaceId) {
                const workspaceResult = await this.db.query(
                    `SELECT owner_id FROM workspaces WHERE id = $1`,
                    [workspaceId]
                );
                if (workspaceResult.rows[0]?.owner_id) {
                    const prefsResult = await this.db.query(
                        `SELECT currency FROM user_preferences WHERE user_id = $1`,
                        [workspaceResult.rows[0].owner_id]
                    );
                    if (prefsResult.rows[0]?.currency) {
                        return prefsResult.rows[0].currency;
                    }
                }
            }
            // Fallback to user_id
            if (userId) {
                const prefsResult = await this.db.query(
                    `SELECT currency FROM user_preferences WHERE user_id = $1`,
                    [userId]
                );
                if (prefsResult.rows[0]?.currency) {
                    return prefsResult.rows[0].currency;
                }
            }
        } catch (error) {
            console.error('[AnalyticsService] Error getting user preferred currency:', error);
        }
        return 'USD';
    }

    private async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
        if (fromCurrency === toCurrency) return 1;
        try {
            const result = await this.exchangeRateService.convert(1, fromCurrency, toCurrency);
            return result.rate;
        } catch (error) {
            console.warn('Could not get exchange rate:', error);
            return 1;
        }
    }

    private async convertAmount(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
        if (fromCurrency === toCurrency) return amount;
        const rate = await this.getExchangeRate(fromCurrency, toCurrency);
        return amount * rate;
    }

    async getOverview(workspaceId: string, period: string, filters?: AnalyticsFilters): Promise<AnalyticsOverview> {
        const dateRange = this.getDateRange(period, filters);
        // Use preferredCurrency from filters if provided, otherwise get from user settings
        const preferredCurrency = filters?.preferredCurrency || await this.getUserPreferredCurrency(undefined, workspaceId);

        // Current period query
        const currParams: any[] = [workspaceId, dateRange.startDate];
        let currQuery = `SELECT t.amount, t.type, t.currency FROM transactions t WHERE t.workspace_id = $1 AND t.date >= $2 AND t.date <= NOW()`;
        
        if (filters?.accounts?.length) {
            currQuery += ` AND t.account_id = ANY($${currParams.length + 1})`;
            currParams.push(filters.accounts);
        }
        if (filters?.categories?.length) {
            currQuery += ` AND t.category_id = ANY($${currParams.length + 1})`;
            currParams.push(filters.categories);
        }
        const currResult = await this.db.query(currQuery, currParams);

        // Previous period query
        const prevParams: any[] = [workspaceId, dateRange.prevStartDate, dateRange.startDate];
        let prevQuery = `SELECT t.amount, t.type, t.currency FROM transactions t WHERE t.workspace_id = $1 AND t.date >= $2 AND t.date < $3`;
        
        if (filters?.accounts?.length) {
            prevQuery += ` AND t.account_id = ANY($${prevParams.length + 1})`;
            prevParams.push(filters.accounts);
        }
        if (filters?.categories?.length) {
            prevQuery += ` AND t.category_id = ANY($${prevParams.length + 1})`;
            prevParams.push(filters.categories);
        }
        const prevResult = await this.db.query(prevQuery, prevParams);

        // Calculate totals with conversion
        let currIncome = 0, currExpense = 0;
        for (const tx of currResult.rows) {
            const converted = await this.convertAmount(parseFloat(tx.amount || '0'), tx.currency || 'USD', preferredCurrency);
            if (tx.type === 'income') currIncome += converted;
            else currExpense += converted;
        }

        let prevIncome = 0, prevExpense = 0;
        for (const tx of prevResult.rows) {
            const converted = await this.convertAmount(parseFloat(tx.amount || '0'), tx.currency || 'USD', preferredCurrency);
            if (tx.type === 'income') prevIncome += converted;
            else prevExpense += converted;
        }

        const savingsRate = currIncome > 0 ? ((currIncome - currExpense) / currIncome) * 100 : 0;
        const incomeChange = prevIncome > 0 ? ((currIncome - prevIncome) / prevIncome) * 100 : 0;
        const expenseChange = prevExpense > 0 ? ((currExpense - prevExpense) / prevExpense) * 100 : 0;

        // Get accounts and transactions count
        const accountsResult = await this.db.query(
            `SELECT COUNT(*) as count FROM accounts WHERE workspace_id = $1 AND is_active = true`,
            [workspaceId]
        );
        const transactionsResult = await this.db.query(
            `SELECT COUNT(*) as count FROM transactions WHERE workspace_id = $1 AND date >= $2 AND date <= NOW()`,
            [workspaceId, dateRange.startDate]
        );

        return {
            monthlyIncome: Math.round(currIncome * 100) / 100,
            monthlyExpenses: Math.round(currExpense * 100) / 100,
            totalBalance: Math.round((currIncome - currExpense) * 100) / 100,
            savingsRate: Math.max(0, Math.round(savingsRate * 100) / 100),
            accountsCount: parseInt(accountsResult.rows[0]?.count || '0'),
            transactionsCount: parseInt(transactionsResult.rows[0]?.count || '0'),
            topCategory: null,
            biggestExpense: Math.round(currExpense * 100) / 100,
            periodComparison: {
                incomeChange: Math.round(incomeChange * 100) / 100,
                expenseChange: Math.round(expenseChange * 100) / 100,
            }
        };
    }

    async getCategoryTrends(workspaceId: string, months: number = 6, filters?: AnalyticsFilters): Promise<CategoryTrend[]> {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);
        
        const preferredCurrency = filters?.preferredCurrency || await this.getUserPreferredCurrency(undefined, workspaceId);
        
        const params: any[] = [workspaceId, startDate.toISOString()];
        let query = `SELECT COALESCE(c.name, 'Uncategorized') as category, c.id as category_id, t.amount, t.currency FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.workspace_id = $1 AND t.type = 'expense' AND t.date >= $2 AND t.date <= NOW()`;

        if (filters?.accounts?.length) {
            query += ` AND t.account_id = ANY($${params.length + 1})`;
            params.push(filters.accounts);
        }
        if (filters?.categories?.length) {
            query += ` AND t.category_id = ANY($${params.length + 1})`;
            params.push(filters.categories);
        }

        const result = await this.db.query(query, params);
        
        const categoryData: Record<string, number> = {};
        for (const tx of result.rows) {
            const converted = await this.convertAmount(parseFloat(tx.amount || '0'), tx.currency || 'USD', preferredCurrency);
            categoryData[tx.category] = (categoryData[tx.category] || 0) + converted;
        }

        return Object.entries(categoryData).map(([category, amount]) => ({
            category,
            amount: Math.round(amount * 100) / 100,
            percentage: 0,
            trend: 'stable' as const,
            transactionCount: 0,
        }));
    }

    async getComparison(workspaceId: string, period: string = 'month', months: number = 12, filters?: AnalyticsFilters): Promise<MonthlyComparison[]> {
        let startDate: Date;
        let endDate: Date;

        if (filters?.startDate && filters?.endDate) {
            startDate = new Date(filters.startDate);
            endDate = new Date(filters.endDate);
        } else if (filters?.startDate) {
            startDate = new Date(filters.startDate);
            endDate = new Date();
        } else if (filters?.endDate) {
            startDate = new Date();
            startDate.setMonth(startDate.getMonth() - months);
            endDate = new Date(filters.endDate);
        } else {
            startDate = this.getStartDateForPeriod(period);
            startDate.setMonth(startDate.getMonth() - months);
            endDate = new Date();
        }

        const preferredCurrency = filters?.preferredCurrency || await this.getUserPreferredCurrency(undefined, workspaceId);

        const { dateFormat, labelFormat } = this.getDateFormatsForPeriod(period);
        const params: any[] = [workspaceId, startDate.toISOString(), endDate.toISOString()];
        let query = `SELECT TO_CHAR(date, '${dateFormat}') as period_key, TO_CHAR(date, '${labelFormat}') as period_label, amount, type, currency FROM transactions WHERE workspace_id = $1 AND date >= $2 AND date <= $3`;

        if (filters?.accounts?.length) {
            query += ` AND account_id = ANY($${params.length + 1})`;
            params.push(filters.accounts);
        }
        if (filters?.categories?.length) {
            query += ` AND category_id = ANY($${params.length + 1})`;
            params.push(filters.categories);
        }

        const result = await this.db.query(query, params);

        const periodData: Record<string, { income: number; expense: number; label: string }> = {};
        for (const tx of result.rows) {
            if (!periodData[tx.period_key]) periodData[tx.period_key] = { income: 0, expense: 0, label: tx.period_label };
            const converted = await this.convertAmount(parseFloat(tx.amount || '0'), tx.currency || 'USD', preferredCurrency);
            if (tx.type === 'income') periodData[tx.period_key].income += converted;
            else periodData[tx.period_key].expense += converted;
        }

        return Object.entries(periodData).map(([period, data]) => ({
            period,
            periodLabel: data.label,
            income: Math.round(data.income * 100) / 100,
            expense: Math.round(data.expense * 100) / 100,
            savings: Math.round((data.income - data.expense) * 100) / 100,
        })).sort((a, b) => a.period.localeCompare(b.period));
    }

    private getDateFormatsForPeriod(period: string): { dateFormat: string; labelFormat: string } {
        switch (period) {
            case 'day':
                return { dateFormat: 'YYYY-MM-DD', labelFormat: 'Mon DD, YYYY' };
            case 'week':
                return { dateFormat: 'IYYY-IW', labelFormat: '"W"IW YYYY' };
            case 'month':
                return { dateFormat: 'YYYY-MM', labelFormat: 'MMM YYYY' };
            case 'year':
                return { dateFormat: 'YYYY', labelFormat: 'YYYY' };
            default:
                return { dateFormat: 'YYYY-MM', labelFormat: 'MMM YYYY' };
        }
    }

    async getSpendingTrend(workspaceId: string, period: string, filters?: AnalyticsFilters): Promise<SpendingTrend[]> {
        let startDate: Date;
        let endDate: Date;

        if (filters?.startDate && filters?.endDate) {
            startDate = new Date(filters.startDate);
            endDate = new Date(filters.endDate);
        } else if (filters?.startDate) {
            startDate = new Date(filters.startDate);
            endDate = new Date();
        } else if (filters?.endDate) {
            startDate = this.getStartDateForPeriod(period);
            endDate = new Date(filters.endDate);
        } else {
            startDate = this.getStartDateForPeriod(period);
            endDate = new Date();
        }

        const preferredCurrency = filters?.preferredCurrency || await this.getUserPreferredCurrency(undefined, workspaceId);

        const dateTrunc = this.getDateTruncForPeriod(period);
        const params: any[] = [workspaceId, startDate.toISOString(), endDate.toISOString()];
        let query = `SELECT DATE_TRUNC('${dateTrunc}', date) as period, amount, type, currency FROM transactions WHERE workspace_id = $1 AND date >= $2 AND date <= $3`;

        if (filters?.accounts?.length) {
            query += ` AND account_id = ANY($${params.length + 1})`;
            params.push(filters.accounts);
        }
        if (filters?.categories?.length) {
            query += ` AND category_id = ANY($${params.length + 1})`;
            params.push(filters.categories);
        }
        query += ` ORDER BY period ASC`;

        const result = await this.db.query(query, params);

        const periodData: Record<string, { income: number; expense: number }> = {};
        for (const tx of result.rows) {
            const periodKey = this.formatPeriodKey(tx.period, period);
            if (!periodData[periodKey]) periodData[periodKey] = { income: 0, expense: 0 };
            const converted = await this.convertAmount(parseFloat(tx.amount || '0'), tx.currency || 'USD', preferredCurrency);
            if (tx.type === 'income') periodData[periodKey].income += converted;
            else periodData[periodKey].expense += converted;
        }

        return Object.entries(periodData).map(([period, data]) => ({
            period,
            income: Math.round(data.income * 100) / 100,
            expense: Math.round(data.expense * 100) / 100,
            balance: Math.round((data.income - data.expense) * 100) / 100,
        }));
    }

    private getStartDateForPeriod(period: string): Date {
        const startDate = new Date();
        switch (period) {
            case 'day':
                startDate.setDate(startDate.getDate() - 30);
                break;
            case 'week':
                startDate.setDate(startDate.getDate() - 84);
                break;
            case 'month':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 5);
                break;
            default:
                startDate.setFullYear(startDate.getFullYear() - 1);
        }
        return startDate;
    }

    private getDateTruncForPeriod(period: string): string {
        switch (period) {
            case 'day': return 'day';
            case 'week': return 'week';
            case 'month': return 'month';
            case 'year': return 'year';
            default: return 'month';
        }
    }

    private formatPeriodKey(period: any, periodType: string): string {
        if (!period) return '';
        const date = new Date(period);
        if (isNaN(date.getTime())) return String(period);
        
        switch (periodType) {
            case 'day':
                return date.toISOString().split('T')[0];
            case 'week':
                return date.toISOString().split('W')[0] + '-W' + this.getWeekNumber(date);
            case 'month':
                return date.toISOString().slice(0, 7);
            case 'year':
                return date.getFullYear().toString();
            default:
                return date.toISOString().split('T')[0];
        }
    }

    private getWeekNumber(date: Date): string {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return String(Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7));
    }

    async getTopMerchants(workspaceId: string, period: string, limit: number = 10, filters?: AnalyticsFilters): Promise<TopMerchant[]> {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);

        const preferredCurrency = filters?.preferredCurrency || await this.getUserPreferredCurrency(undefined, workspaceId);

        const params: any[] = [workspaceId, startDate.toISOString(), limit];
        let query = `SELECT COALESCE(description, 'Unknown') as merchant, SUM(amount) as total, COUNT(id) as transaction_count, MAX(date) as last_transaction FROM transactions WHERE workspace_id = $1 AND type = 'expense' AND date >= $2 AND date <= NOW() AND description IS NOT NULL`;

        if (filters?.accounts?.length) {
            query += ` AND account_id = ANY($${params.length + 1})`;
            params.push(filters.accounts);
        }
        if (filters?.categories?.length) {
            query += ` AND category_id = ANY($${params.length + 1})`;
            params.push(filters.categories);
        }
        query += ` GROUP BY description ORDER BY total DESC LIMIT $3`;

        const result = await this.db.query(query, params);

        const returnData = await Promise.all(result.rows.map(async (row: any) => {
            const convertedAmount = await this.convertAmount(parseFloat(row.total || '0'), 'USD', preferredCurrency);
            return {
                merchant: row.merchant,
                amount: convertedAmount,
                transactionCount: parseInt(row.transaction_count || '0'),
                category: 'Uncategorized',
                lastTransaction: row.last_transaction,
            };
        }));
        return returnData;
    }

    private getDateRange(period: string, filters?: AnalyticsFilters): { startDate: string; prevStartDate: string } {
        const now = new Date();
        let startDate = new Date(now);
        let prevStartDate = new Date(now);

        switch (period) {
            case 'day':
                startDate.setDate(startDate.getDate() - 30);
                prevStartDate.setDate(prevStartDate.getDate() - 60);
                break;
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                prevStartDate.setDate(prevStartDate.getDate() - 14);
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                prevStartDate.setFullYear(prevStartDate.getFullYear() - 2);
                break;
            default:
                startDate.setMonth(startDate.getMonth() - 1);
                prevStartDate.setMonth(prevStartDate.getMonth() - 2);
        }

        return {
            startDate: startDate.toISOString(),
            prevStartDate: prevStartDate.toISOString(),
        };
    }
}
