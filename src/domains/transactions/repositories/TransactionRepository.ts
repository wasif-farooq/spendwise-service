import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Transaction, TransactionProps } from '../models/Transaction';

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
        startDate?: string;
        endDate?: string;
    } = {}): Promise<{ transactions: Transaction[]; total: number }> {
        const { limit = 50, offset = 0, search, accountId, startDate, endDate } = options;

        let whereClause = 'WHERE t.workspace_id = $1';
        const params: any[] = [workspaceId];
        let paramIndex = 2;

        if (accountId) {
            whereClause += ` AND t.account_id = $${paramIndex}`;
            params.push(accountId);
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

        // Get total count
        const countResult = await this.db.query(
            `SELECT COUNT(*) as total FROM transactions t ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0]?.total || '0');

        // Get paginated results
        const query = `
            SELECT * FROM transactions t
            ${whereClause}
            ORDER BY t.date DESC, t.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        
        const result = await this.db.query(query, [...params, limit, offset]);
        
        return {
            transactions: result.rows.map((row: any) => this.mapToEntity(row)),
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
            to_account_id: data.toAccountId,
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
                to_account_id = $8,
                exchange_rate = $9,
                base_amount = $10,
                updated_at = $11
            WHERE id = $12
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
            data.toAccountId,
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
            toAccountId: row.to_account_id,
            exchangeRate: row.exchange_rate ? parseFloat(row.exchange_rate) : undefined,
            baseAmount: row.base_amount ? parseFloat(row.base_amount) : undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
        return Transaction.restore(props, row.id);
    }
}
