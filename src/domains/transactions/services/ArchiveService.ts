import { DatabaseFacade } from '@facades/DatabaseFacade';

export interface ArchiveOptions {
    olderThan: Date;
    batchSize?: number;
    dryRun?: boolean;
}

export interface ArchiveResult {
    archived: number;
    remaining: number;
    dryRun?: boolean;
}

export class TransactionArchiveService {
    constructor(private db: DatabaseFacade) {}

    /**
     * Archive transactions older than specified date
     */
    async archiveOldTransactions(options: ArchiveOptions): Promise<ArchiveResult> {
        const { olderThan, batchSize = 1000, dryRun = false } = options;

        // Get count to archive
        const countResult = await this.db.query(
            `SELECT COUNT(*) as count FROM transactions WHERE date < $1`,
            [olderThan]
        );
        const totalToArchive = parseInt(countResult.rows[0].count);

        if (totalToArchive === 0) {
            const remainingResult = await this.db.query(`SELECT COUNT(*) as count FROM transactions`);
            return { 
                archived: 0, 
                remaining: parseInt(remainingResult.rows[0].count) 
            };
        }

        if (dryRun) {
            const remainingResult = await this.db.query(`SELECT COUNT(*) as count FROM transactions`);
            return { 
                archived: totalToArchive, 
                remaining: parseInt(remainingResult.rows[0].count),
                dryRun: true 
            };
        }

        // Use the SQL function for efficient archival
        const result = await this.db.query(
            `SELECT * FROM archive_transactions($1, $2)`,
            [olderThan, batchSize]
        );

        const remainingResult = await this.db.query(`SELECT COUNT(*) as count FROM transactions`);

        return {
            archived: result.rows[0].archived_count,
            remaining: parseInt(remainingResult.rows[0].count),
        };
    }

    /**
     * Restore transactions from archive
     */
    async restoreFromArchive(transactionIds: string[]): Promise<number> {
        const result = await this.db.query(
            `SELECT restore_transactions($1) as restored`,
            [transactionIds]
        );
        return parseInt(result.rows[0].restored);
    }

    /**
     * Get archive statistics
     */
    async getArchiveStats(): Promise<{
        archivedCount: number;
        oldestArchivedDate: Date | null;
        totalSize: string;
    }> {
        const countResult = await this.db.query(
            `SELECT COUNT(*) as count FROM transactions_archive`
        );
        
        const dateResult = await this.db.query(
            `SELECT MIN(date) as oldest FROM transactions_archive`
        );

        // Approximate size calculation
        const sizeResult = await this.db.query(`
            SELECT pg_size_pretty(pg_total_relation_size('transactions_archive')) as size
        `);

        return {
            archivedCount: parseInt(countResult.rows[0].count),
            oldestArchivedDate: dateResult.rows[0].oldest,
            totalSize: sizeResult.rows[0].size,
        };
    }

    /**
     * Search in archived transactions
     */
    async searchArchive(
        workspaceId: string,
        options: {
            limit?: number;
            cursor?: string;
            startDate?: string;
            endDate?: string;
            accountId?: string;
        }
    ): Promise<{
        data: any[];
        pagination: { nextCursor: string | null; hasMore: boolean };
    }> {
        const { limit = 50, cursor, startDate, endDate, accountId } = options;

        let whereClause = 'WHERE workspace_id = $1';
        const params: any[] = [workspaceId];
        let paramIndex = 2;

        if (accountId) {
            whereClause += ` AND account_id = $${paramIndex}`;
            params.push(accountId);
            paramIndex++;
        }

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

        // Cursor support for archive
        if (cursor) {
            const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
            const [id, date] = decoded.split('|');
            whereClause += ` AND (date < $${paramIndex} OR (date = $${paramIndex} AND id < $${paramIndex + 1}))`;
            params.push(date, id);
            paramIndex += 2;
        }

        const query = `
            SELECT * FROM transactions_archive 
            ${whereClause}
            ORDER BY date DESC, id DESC
            LIMIT $${paramIndex}
        `;
        params.push(limit + 1);

        const result = await this.db.query(query, params);
        const hasMore = result.rows.length > limit;
        const data = hasMore ? result.rows.slice(0, -1) : result.rows;

        return {
            data,
            pagination: {
                nextCursor: hasMore && data.length > 0 
                    ? Buffer.from(`${data[data.length - 1].id}|${data[data.length - 1].date}`).toString('base64')
                    : null,
                hasMore,
            },
        };
    }
}
