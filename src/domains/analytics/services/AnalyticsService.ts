import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { ExchangeRateService } from '@domains/exchange-rates/services/ExchangeRateService';

export interface AnalyticsOverview {
    totalIncome: number;
    totalExpense: number;
    netCashFlow: number;
    savingsRate: number;
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
    month: string;
    monthLabel: string;
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

export class AnalyticsService {
    private exchangeRateService: ExchangeRateService;
    private db: DatabaseFacade;

    constructor() {
        const exchangeRateRepo = Container.getInstance().resolve<any>(TOKENS.ExchangeRateRepository);
        this.exchangeRateService = new ExchangeRateService(exchangeRateRepo);
        this.db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
    }

    // Helper to get user's preferred currency
    private async getUserPreferredCurrency(userId?: string, workspaceId?: string): Promise<string> {
        // Default to USD for now - can be enhanced to read from user_preferences or workspace settings
        return 'USD';
    }

    // Helper to get exchange rate between currencies
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

    // Convert amount from one currency to another
    private async convertAmount(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
        if (fromCurrency === toCurrency) return amount;
        
        const rate = await this.getExchangeRate(fromCurrency, toCurrency);
        return amount * rate;
    }

    async getOverview(workspaceId: string, period: string): Promise<AnalyticsOverview> {
        const dateRange = this.getDateRange(period);
        const preferredCurrency = await this.getUserPreferredCurrency(undefined, workspaceId);
        
        // Get all transactions in the current period with their currencies
        const currentPeriodTransactions = await this.db.query(`
            SELECT t.amount, t.type, t.currency
            FROM transactions t
            WHERE t.workspace_id = $1 
            AND t.date >= $2 
            AND t.date <= NOW()
        `, [workspaceId, dateRange.startDate]);

        // Get all transactions in the previous period
        const previousPeriodTransactions = await this.db.query(`
            SELECT t.amount, t.type, t.currency
            FROM transactions t
            WHERE t.workspace_id = $1 
            AND t.date >= $2 
            AND t.date < $3
        `, [workspaceId, dateRange.prevStartDate, dateRange.startDate]);

        // Convert and sum current period amounts
        let currIncome = 0;
        let currExpense = 0;
        for (const tx of currentPeriodTransactions.rows) {
            const convertedAmount = await this.convertAmount(
                parseFloat(tx.amount || '0'),
                tx.currency || 'USD',
                preferredCurrency
            );
            if (tx.type === 'income') {
                currIncome += convertedAmount;
            } else {
                currExpense += convertedAmount;
            }
        }

        // Convert and sum previous period amounts
        let prevIncome = 0;
        let prevExpense = 0;
        for (const tx of previousPeriodTransactions.rows) {
            const convertedAmount = await this.convertAmount(
                parseFloat(tx.amount || '0'),
                tx.currency || 'USD',
                preferredCurrency
            );
            if (tx.type === 'income') {
                prevIncome += convertedAmount;
            } else {
                prevExpense += convertedAmount;
            }
        }

        // Get top category (also convert amounts)
        const topCategoryResult = await this.db.query(`
            SELECT 
                COALESCE(c.name, 'Uncategorized') as category,
                SUM(t.amount) as total,
                t.currency as currency
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.workspace_id = $1 
            AND t.type = 'expense'
            AND t.date >= $2 
            AND t.date <= NOW()
            GROUP BY c.name, t.currency
            ORDER BY total DESC
            LIMIT 1
        `, [workspaceId, dateRange.startDate]);

        let topCategory: string | null = null;
        let biggestExpense = 0;
        if (topCategoryResult.rows[0]) {
            topCategory = topCategoryResult.rows[0].category;
            biggestExpense = await this.convertAmount(
                parseFloat(topCategoryResult.rows[0].total || '0'),
                topCategoryResult.rows[0].currency || 'USD',
                preferredCurrency
            );
        }

        // Calculate savings rate
        const savingsRate = currIncome > 0 ? ((currIncome - currExpense) / currIncome) * 100 : 0;

        // Calculate percentage changes
        const incomeChange = prevIncome > 0 ? ((currIncome - prevIncome) / prevIncome) * 100 : 0;
        const expenseChange = prevExpense > 0 ? ((currExpense - prevExpense) / prevExpense) * 100 : 0;

        return {
            totalIncome: Math.round(currIncome * 100) / 100,
            totalExpense: Math.round(currExpense * 100) / 100,
            netCashFlow: Math.round((currIncome - currExpense) * 100) / 100,
            savingsRate: Math.max(0, Math.round(savingsRate * 100) / 100),
            topCategory,
            biggestExpense: Math.round(biggestExpense * 100) / 100,
            periodComparison: {
                incomeChange: Math.round(incomeChange * 100) / 100,
                expenseChange: Math.round(expenseChange * 100) / 100,
            }
        };
    }

    async getCategoryTrends(workspaceId: string, months: number = 6): Promise<CategoryTrend[]> {
        const preferredCurrency = await this.getUserPreferredCurrency(undefined, workspaceId);
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);

        // Get all transactions with currency info
        const transactions = await this.db.query(`
            SELECT 
                COALESCE(c.name, 'Uncategorized') as category,
                c.id as category_id,
                t.amount,
                t.currency,
                t.type
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.workspace_id = $1 
            AND t.type = 'expense'
            AND t.date >= $2
            AND t.date <= NOW()
        `, [workspaceId, startDate.toISOString()]);

        // Group by category and convert currencies
        const categoryData: Record<string, { amount: number; count: number; currency: string }> = {};
        for (const tx of transactions.rows) {
            const category = tx.category || 'Uncategorized';
            if (!categoryData[category]) {
                categoryData[category] = { amount: 0, count: 0, currency: tx.currency || 'USD' };
            }
            const converted = await this.convertAmount(
                parseFloat(tx.amount || '0'),
                tx.currency || 'USD',
                preferredCurrency
            );
            categoryData[category].amount += converted;
            categoryData[category].count += 1;
        }

        // Calculate total for percentage
        let totalExpense = 0;
        for (const cat of Object.values(categoryData)) {
            totalExpense += cat.amount;
        }

        // Get previous period for trend
        const prevStartDate = new Date(startDate);
        prevStartDate.setMonth(prevStartDate.getMonth() - months);

        const prevTransactions = await this.db.query(`
            SELECT 
                COALESCE(c.name, 'Uncategorized') as category,
                t.amount,
                t.currency
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.workspace_id = $1 
            AND t.type = 'expense'
            AND t.date >= $2
            AND t.date < $3
        `, [workspaceId, prevStartDate.toISOString(), startDate.toISOString()]);

        const prevTotals: Record<string, number> = {};
        for (const tx of prevTransactions.rows) {
            const category = tx.category || 'Uncategorized';
            const converted = await this.convertAmount(
                parseFloat(tx.amount || '0'),
                tx.currency || 'USD',
                preferredCurrency
            );
            prevTotals[category] = (prevTotals[category] || 0) + converted;
        }

        const trends: CategoryTrend[] = [];
        for (const [category, data] of Object.entries(categoryData)) {
            const currentAmount = data.amount;
            const prevAmount = prevTotals[category] || 0;
            
            let trend: 'up' | 'down' | 'stable' = 'stable';
            if (prevAmount > 0) {
                const change = ((currentAmount - prevAmount) / prevAmount) * 100;
                if (change > 5) trend = 'up';
                else if (change < -5) trend = 'down';
            }

            trends.push({
                category,
                amount: Math.round(currentAmount * 100) / 100,
                percentage: totalExpense > 0 ? Math.round((currentAmount / totalExpense) * 10000) / 100 : 0,
                trend,
                transactionCount: data.count,
            });
        }

        return trends.sort((a, b) => b.amount - a.amount);
    }

    async getMonthlyComparison(workspaceId: string, months: number = 12): Promise<MonthlyComparison[]> {
        const preferredCurrency = await this.getUserPreferredCurrency(undefined, workspaceId);
        
        // Get all transactions with currency
        const transactions = await this.db.query(`
            SELECT 
                TO_CHAR(date, 'YYYY-MM') as month,
                TO_CHAR(date, 'MMM YYYY') as month_label,
                amount,
                type,
                currency
            FROM transactions 
            WHERE workspace_id = $1 
            AND date >= NOW() - INTERVAL '${months} months'
        `, [workspaceId]);

        // Group by month and convert currencies
        const monthlyData: Record<string, { income: number; expense: number; label: string }> = {};
        
        for (const tx of transactions.rows) {
            const month = tx.month;
            if (!monthlyData[month]) {
                monthlyData[month] = { income: 0, expense: 0, label: tx.month_label };
            }
            
            const converted = await this.convertAmount(
                parseFloat(tx.amount || '0'),
                tx.currency || 'USD',
                preferredCurrency
            );
            
            if (tx.type === 'income') {
                monthlyData[month].income += converted;
            } else {
                monthlyData[month].expense += converted;
            }
        }

        const result: MonthlyComparison[] = [];
        for (const [month, data] of Object.entries(monthlyData).sort()) {
            result.push({
                month,
                monthLabel: data.label,
                income: Math.round(data.income * 100) / 100,
                expense: Math.round(data.expense * 100) / 100,
                savings: Math.round((data.income - data.expense) * 100) / 100,
            });
        }

        return result;
    }

    async getSpendingTrend(workspaceId: string, period: string, accountId?: string): Promise<SpendingTrend[]> {
        const preferredCurrency = await this.getUserPreferredCurrency(undefined, workspaceId);
        
        let groupBy: string;
        
        switch (period) {
            case 'week':
                groupBy = 'DATE_TRUNC(\'week\', date)';
                break;
            case 'year':
                groupBy = 'DATE_TRUNC(\'year\', date)';
                break;
            default: // month
                groupBy = 'DATE_TRUNC(\'month\', date)';
        }

        let query = `
            SELECT 
                ${groupBy} as period,
                amount,
                type,
                currency
            FROM transactions 
            WHERE workspace_id = $1 
            AND date >= NOW() - INTERVAL '12 ${period}s'
        `;
        
        const params: any[] = [workspaceId];
        
        if (accountId) {
            query += ` AND account_id = $2`;
            params.push(accountId);
        }
        
        query += ` ORDER BY period ASC`;

        const transactions = await this.db.query(query, params);

        // Group by period and convert currencies
        const periodData: Record<string, { income: number; expense: number }> = {};
        
        for (const tx of transactions.rows) {
            const periodKey = tx.period?.toISOString()?.split('T')[0] || '';
            if (!periodData[periodKey]) {
                periodData[periodKey] = { income: 0, expense: 0 };
            }
            
            const converted = await this.convertAmount(
                parseFloat(tx.amount || '0'),
                tx.currency || 'USD',
                preferredCurrency
            );
            
            if (tx.type === 'income') {
                periodData[periodKey].income += converted;
            } else {
                periodData[periodKey].expense += converted;
            }
        }

        const result: SpendingTrend[] = [];
        for (const [periodKey, data] of Object.entries(periodData).sort()) {
            result.push({
                period: periodKey,
                income: Math.round(data.income * 100) / 100,
                expense: Math.round(data.expense * 100) / 100,
                balance: Math.round((data.income - data.expense) * 100) / 100,
            });
        }

        return result;
    }

    async getTopMerchants(workspaceId: string, period: string, limit: number = 10): Promise<TopMerchant[]> {
        const dateRange = this.getDateRange(period);

        // First get the merchant totals
        const result = await this.db.query(`
            SELECT 
                COALESCE(description, 'Unknown') as merchant,
                SUM(amount) as total,
                COUNT(id) as transaction_count,
                MAX(date) as last_transaction
            FROM transactions 
            WHERE workspace_id = $1 
            AND type = 'expense'
            AND date >= $2 
            AND date <= NOW()
            AND description IS NOT NULL
            GROUP BY description
            ORDER BY total DESC
            LIMIT $3
        `, [workspaceId, dateRange.startDate, limit]);

        return result.rows.map((row: any) => ({
            merchant: row.merchant,
            amount: parseFloat(row.total || '0'),
            transactionCount: parseInt(row.transaction_count || '0'),
            category: 'Uncategorized',
            lastTransaction: row.last_transaction,
        }));
    }

    private getDateRange(period: string): { startDate: string; prevStartDate: string } {
        const now = new Date();
        let startDate: Date;
        let prevStartDate: Date;

        switch (period) {
            case 'week':
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 7);
                prevStartDate = new Date(startDate);
                prevStartDate.setDate(prevStartDate.getDate() - 7);
                break;
            case 'year':
                startDate = new Date(now);
                startDate.setFullYear(startDate.getFullYear() - 1);
                prevStartDate = new Date(startDate);
                prevStartDate.setFullYear(prevStartDate.getFullYear() - 1);
                break;
            default: // month
                startDate = new Date(now);
                startDate.setMonth(startDate.getMonth() - 1);
                prevStartDate = new Date(startDate);
                prevStartDate.setMonth(prevStartDate.getMonth() - 1);
        }

        return {
            startDate: startDate.toISOString(),
            prevStartDate: prevStartDate.toISOString(),
        };
    }
}
