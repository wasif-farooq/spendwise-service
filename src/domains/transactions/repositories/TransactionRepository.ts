import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Transaction, TransactionProps } from '../models/Transaction';

// In-memory cache for stats (fallback when Redis unavailable)
interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

class StatsCache {
    private cache = new Map<string, CacheEntry<any>>();
    private defaultTTL = 5 * 60 * 1000; // 5 minutes

    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return entry.data as T;
    }

    set<T>(key: string, data: T, ttl = this.defaultTTL): void {
        this.cache.set(key, { data, expiresAt: Date.now() + ttl });
    }

    invalidate(key: string): void {
        this.cache.delete(key);
    }

    invalidatePattern(pattern: string): void {
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) this.cache.delete(key);
        }
    }
}

const statsCache = new StatsCache();
const ACCOUNTS_STATS_TTL = 5 * 60 * 1000; // 5 minutes

export class TransactionRepository {
    constructor(private db: DatabaseFacade) { }

    async findById(id: string): Promise<Transaction | null> {
        const result = await this.db.query(
            'SELECT * FROM transactions WHERE id = $1',
            [id]
        );
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    async findByAccountId(accountId: string, limit = 100, offset = 0): Promise<Transaction[]> {
        const result = await this.db.query(
            'SELECT * FROM transactions WHERE account_id = $1 ORDER BY date DESC, created_at DESC LIMIT $2 OFFSET $3',
            [accountId, limit, offset]
        );
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    async findByWorkspaceId(workspaceId: string, options: {
        limit?: number;
        offset?: number;
        search?: string;
        accountId?: string;
        categoryId?: string;
        category?: string;
        type?: string;
        startDate?: string;
        endDate?: string;
        linkedStatus?: 'all' | 'linked' | 'unlinked';
    } = {}): Promise<{ transactions: Transaction[]; total: number }> {
        const { limit = 50, offset = 0, search, accountId, categoryId, category, type, startDate, endDate, linkedStatus } = options;

        let whereClause = 'WHERE t.workspace_id = $1';
        const params: any[] = [workspaceId];
        let paramIndex = 2;

        if (accountId) {
            whereClause += ` AND t.account_id = $${paramIndex}`;
            params.push(accountId);
            paramIndex++;
        }

        if (categoryId) {
            whereClause += ` AND t.category_id = $${paramIndex}`;
            params.push(categoryId);
            paramIndex++;
        }

        // Filter by category name
        if (category) {
            whereClause += ` AND c.name ILIKE $${paramIndex}`;
            params.push(`%${category}%`);
            paramIndex++;
        }

        if (type) {
            whereClause += ` AND t.type = $${paramIndex}`;
            params.push(type);
            paramIndex++;
        }

        if (startDate) {
            whereClause += ` AND t.date >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            whereClause += ` AND t.date <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        if (search) {
            whereClause += ` AND (t.description ILIKE $${paramIndex} OR t.amount::text ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        // Filter by linked status
        if (linkedStatus && linkedStatus !== 'all') {
            if (linkedStatus === 'linked') {
                whereClause += ` AND t.linked_transaction_id IS NOT NULL`;
            } else if (linkedStatus === 'unlinked') {
                whereClause += ` AND t.linked_transaction_id IS NULL`;
            }
        }

        // Get total count
        const countResult = await this.db.query(
            `SELECT COUNT(*) as total FROM transactions t ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0]?.total || '0');

        // Get paginated results with category name
        const query = `
            SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            ${whereClause}
            ORDER BY t.date DESC, t.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        
        const result = await this.db.query(query, [...params, limit, offset]);
        
        return {
            transactions: result.rows.map((row: any) => this.mapToEntityWithCategory(row)),
            total
        };
    }

    async countByAccountThisMonth(accountId: string): Promise<number> {
        const result = await this.db.query(
            `SELECT COUNT(*) as count FROM transactions 
             WHERE account_id = $1 
             AND created_at >= date_trunc('month', NOW())`,
            [accountId]
        );
        return parseInt(result.rows[0]?.count || '0');
    }

    async countByWorkspaceId(workspaceId: string): Promise<number> {
        const result = await this.db.query(
            'SELECT COUNT(*) as count FROM transactions WHERE workspace_id = $1',
            [workspaceId]
        );
        return parseInt(result.rows[0]?.count || '0');
    }

    // Get account stats: total income, expense, and balance (cached)
    async getAccountStats(accountId: string, startDate?: string, endDate?: string): Promise<{
        totalIncome: number;
        totalExpense: number;
        balance: number;
        fromCache?: boolean;
    }> {
        // Check cache first
        const cacheKey = `stats:${accountId}:${startDate || 'none'}:${endDate || 'none'}`;
        const cached = statsCache.get<{ totalIncome: number; totalExpense: number; balance: number }>(cacheKey);
        
        if (cached) {
            console.log(`[Cache] Account stats HIT for ${accountId}`);
            return { ...cached, fromCache: true };
        }

        console.log(`[Cache] Account stats MISS for ${accountId}`);

        let whereClause = 'WHERE account_id = $1';
        const params: any[] = [accountId];
        let paramIndex = 2;

        if (startDate) {
            whereClause += ` AND date >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            whereClause += ` AND date <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        const result = await this.db.query(
            `SELECT 
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
             FROM transactions ${whereClause}`,
            params
        );

        const totalIncome = parseFloat(result.rows[0]?.total_income || '0');
        const totalExpense = parseFloat(result.rows[0]?.total_expense || '0');

        const stats = {
            totalIncome,
            totalExpense,
            balance: totalIncome - totalExpense
        };

        // Cache the result
        statsCache.set(cacheKey, stats, ACCOUNTS_STATS_TTL);

        return { ...stats, fromCache: false };
    }

    // Invalidate cache when transactions change
    invalidateAccountStatsCache(accountId: string): void {
        statsCache.invalidatePattern(`stats:${accountId}:`);
    }

    // Get all account stats for a workspace
    async getWorkspaceAccountStats(workspaceId: string, startDate?: string, endDate?: string): Promise<Array<{
        accountId: string;
        accountName: string;
        totalIncome: number;
        totalExpense: number;
        balance: number;
    }>> {
        let whereClause = 'WHERE t.workspace_id = $1';
        const params: any[] = [workspaceId];
        let paramIndex = 2;

        if (startDate) {
            whereClause += ` AND t.date >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            whereClause += ` AND t.date <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        const result = await this.db.query(
            `SELECT 
                t.account_id,
                a.name as account_name,
                COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) as total_income,
                COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) as total_expense
             FROM transactions t
             JOIN accounts a ON t.account_id = a.id
             ${whereClause}
             GROUP BY t.account_id, a.name
             ORDER BY a.name`,
            params
        );

        return result.rows.map((row: any) => ({
            accountId: row.account_id,
            accountName: row.account_name,
            totalIncome: parseFloat(row.total_income),
            totalExpense: parseFloat(row.total_expense),
            balance: parseFloat(row.total_income) - parseFloat(row.total_expense)
        }));
    }

    // Get workspace-wide stats
    async getWorkspaceStats(workspaceId: string, startDate?: string, endDate?: string): Promise<{
        totalIncome: number;
        totalExpense: number;
        balance: number;
        transactionCount: number;
    }> {
        let whereClause = 'WHERE workspace_id = $1';
        const params: any[] = [workspaceId];
        let paramIndex = 2;

        if (startDate) {
            whereClause += ` AND date >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            whereClause += ` AND date <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        const result = await this.db.query(
            `SELECT 
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
                COUNT(*) as transaction_count
             FROM transactions ${whereClause}`,
            params
        );

        const totalIncome = parseFloat(result.rows[0]?.total_income || '0');
        const totalExpense = parseFloat(result.rows[0]?.total_expense || '0');

        return {
            totalIncome,
            totalExpense,
            balance: totalIncome - totalExpense,
            transactionCount: parseInt(result.rows[0]?.transaction_count || '0')
        };
    }

    async save(transaction: Transaction): Promise<Transaction> {
        const data = transaction.getProps();
        const mappedData = {
            id: transaction.id,
            account_id: data.accountId,
            user_id: data.userId,
            workspace_id: data.workspaceId,
            type: data.type,
            amount: data.amount,
            currency: data.currency,
            description: data.description,
            date: data.date,
            category_id: data.categoryId,
            linked_transaction_id: data.linkedTransactionId,
            linked_account_id: data.linkedAccountId,
            exchange_rate: data.exchangeRate,
            base_amount: data.baseAmount,
            created_at: data.createdAt,
            updated_at: data.updatedAt,
        };

        const keys = Object.keys(mappedData);
        const values = Object.values(mappedData);
        const indices = keys.map((_, i) => `$${i + 1}`).join(', ');

        const query = `
            INSERT INTO transactions (${keys.join(', ')})
            VALUES (${indices})
            RETURNING *
        `;

        const result = await this.db.query(query, values);
        return this.mapToEntity(result.rows[0]);
    }

    async update(transaction: Transaction): Promise<Transaction> {
        const data = transaction.getProps();
        
        const query = `
            UPDATE transactions SET
                account_id = $1,
                type = $2,
                amount = $3,
                currency = $4,
                description = $5,
                date = $6,
                category_id = $7,
                linked_transaction_id = $8,
                linked_account_id = $9,
                exchange_rate = $10,
                base_amount = $11,
                updated_at = $12
            WHERE id = $13
            RETURNING *
        `;

        const result = await this.db.query(query, [
            data.accountId,
            data.type,
            data.amount,
            data.currency,
            data.description,
            data.date,
            data.categoryId,
            data.linkedTransactionId,
            data.linkedAccountId,
            data.exchangeRate,
            data.baseAmount,
            new Date(),
            transaction.id
        ]);

        return this.mapToEntity(result.rows[0]);
    }

    async delete(id: string): Promise<void> {
        await this.db.query('DELETE FROM transactions WHERE id = $1', [id]);
    }

    private mapToEntity(row: any): Transaction {
        const props: TransactionProps = {
            accountId: row.account_id,
            userId: row.user_id,
            workspaceId: row.workspace_id,
            type: row.type,
            amount: parseFloat(row.amount),
            currency: row.currency,
            description: row.description,
            date: row.date,
            categoryId: row.category_id,
            linkedTransactionId: row.linked_transaction_id,
            linkedAccountId: row.linked_account_id,
            exchangeRate: row.exchange_rate ? parseFloat(row.exchange_rate) : undefined,
            baseAmount: row.base_amount ? parseFloat(row.base_amount) : undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
        return Transaction.restore(props, row.id);
    }

    private mapToEntityWithCategory(row: any): Transaction {
        const props: TransactionProps = {
            accountId: row.account_id,
            userId: row.user_id,
            workspaceId: row.workspace_id,
            type: row.type,
            amount: parseFloat(row.amount),
            currency: row.currency,
            description: row.description,
            date: row.date,
            categoryId: row.category_id,
            categoryName: row.category_name || null,
            linkedTransactionId: row.linked_transaction_id,
            linkedAccountId: row.linked_account_id,
            exchangeRate: row.exchange_rate ? parseFloat(row.exchange_rate) : undefined,
            baseAmount: row.base_amount ? parseFloat(row.base_amount) : undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
        return Transaction.restore(props, row.id);
    }
}
