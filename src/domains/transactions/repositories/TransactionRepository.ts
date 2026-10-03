import { DatabaseFacade } from '@facades/DatabaseFacade';
import { CacheFacade } from '@facades/CacheFacade';
import { Transaction, TransactionProps } from '../models/Transaction';
import { CursorPaginationOptions, CursorFilters, PaginatedResult } from './types';
import { Container } from '@di/Container';

/** One synced row for insertImported (amount is an exact decimal string). */
export interface ImportedTransactionRow {
  accountId: string;
  userId: string | null;
  workspaceId: string;
  type: 'income' | 'expense';
  amount: string;
  currency: string;
  description: string;
  date: Date;
  counterparty?: string | null;
  connectionAccountId: string;
  externalId: string;
  source: 'sync' | 'adjustment';
}

const ACCOUNTS_STATS_TTL = 5 * 60; // 5 minutes in seconds (Redis EX)

export class TransactionRepository {
  private dbToUse: DatabaseFacade;
  private cache: CacheFacade | null;

  constructor(
    private db: DatabaseFacade,
    cache?: CacheFacade,
  ) {
    this.dbToUse = db;
    this.cache = cache || null;
  }

  // Returns a copy bound to `db` (e.g. a transaction client). The shared
  // instance is never modified: repositories are singletons, and rebinding
  // them left every later request on a released client ("Client was closed").
  withDb(db: DatabaseFacade): TransactionRepository {
    const bound = Object.create(Object.getPrototypeOf(this)) as TransactionRepository;
    Object.assign(bound, this);
    bound.dbToUse = db;
    return bound;
  }

  withCache(cache: CacheFacade): TransactionRepository {
    this.cache = cache;
    return this;
  }

  async findById(id: string): Promise<Transaction | null> {
    const result = await this.dbToUse.query(
      'SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.id = $1',
      [id],
    );
    return result.rows[0] ? this.mapToEntityWithCategory(result.rows[0]) : null;
  }

  async findByIdWithDetails(id: string): Promise<any | null> {
    const result = await this.dbToUse.query(
      `SELECT 
                t.*, 
                c.name as category_name,
                c.icon as category_icon,
                c.color as category_color,
                a.name as account_name,
                a.currency as account_currency,
                u.first_name as user_first_name,
                u.last_name as user_last_name
            FROM transactions t 
            LEFT JOIN categories c ON t.category_id = c.id
            LEFT JOIN accounts a ON t.account_id = a.id
            LEFT JOIN users u ON t.user_id = u.id
            WHERE t.id = $1`,
      [id],
    );
    if (!result.rows[0]) return null;

    const row = result.rows[0];

    // Fetch all linked transactions in a single query
    const linkedTransactionIds = row.linked_transaction_ids || [];
    let linkedTransactions: any[] = [];
    if (linkedTransactionIds.length > 0) {
      const linkedResult = await this.dbToUse.query(
        `SELECT t.*, a.name as account_name, c.name as category_name
                 FROM transactions t
                 LEFT JOIN accounts a ON t.account_id = a.id
                 LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.id = ANY($1)`,
        [linkedTransactionIds],
      );
      linkedTransactions = linkedResult.rows;
    }

    // Fetch attachments for receipt_ids
    const receiptIds = row.receipt_ids || [];
    let receipts: any[] = [];

    if (receiptIds.length > 0) {
      try {
        const attachmentsResult = await this.dbToUse.query(
          'SELECT * FROM attachments WHERE id = ANY($1)',
          [receiptIds],
        );

        let storageService: any = null;
        try {
          const StorageModule = await import('@domains/storage/services/StorageService');
          storageService = Container.getInstance().resolve<any>('StorageService');
        } catch (e) {
          console.log('[TransactionRepository] StorageService not available');
        }

        if (storageService) {
          receipts = await Promise.all(
            attachmentsResult.rows.map(async (att: any) => {
              try {
                const { url } = await storageService.getFile(att.id);
                return {
                  id: att.id,
                  filename: att.filename,
                  contentType: att.content_type,
                  size: att.size,
                  url,
                };
              } catch (e) {
                return {
                  id: att.id,
                  filename: att.filename,
                  contentType: att.content_type,
                  size: att.size,
                  url: null,
                };
              }
            }),
          );
        } else {
          // Just return basic info without URLs
          receipts = attachmentsResult.rows.map((att: any) => ({
            id: att.id,
            filename: att.filename,
            contentType: att.content_type,
            size: att.size,
            url: null,
          }));
        }

        // Sort by original order of receiptIds
        receipts.sort((a, b) => receiptIds.indexOf(a.id) - receiptIds.indexOf(b.id));
      } catch (e) {
        console.error('[TransactionRepository] Error fetching attachments:', e);
        receipts = [];
      }
    }

    return {
      id: row.id,
      accountId: row.account_id,
      accountName: row.account_name,
      accountCurrency: row.account_currency,
      userId: row.user_id,
      userName:
        row.user_first_name && row.user_last_name
          ? `${row.user_first_name} ${row.user_last_name}`
          : row.user_first_name || row.user_last_name || null,
      workspaceId: row.workspace_id,
      type: row.type,
      amount: parseFloat(row.amount),
      currency: row.currency,
      description: row.description,
      date: row.date,
      categoryId: row.category_id,
      categoryName: row.category_name,
      categoryIcon: row.category_icon,
      categoryColor: row.category_color,
      linkedTransactionIds: linkedTransactionIds,
      linkedTransactions: linkedTransactions.map((linkedTx) => ({
        id: linkedTx.id,
        accountId: linkedTx.account_id,
        accountName: linkedTx.account_name,
        amount: parseFloat(linkedTx.amount),
        currency: linkedTx.currency,
        type: linkedTx.type,
        description: linkedTx.description,
        date: linkedTx.date,
        categoryName: linkedTx.category_name,
      })),
      receiptIds: receiptIds,
      receipts: receipts,
      exchangeRate: row.exchange_rate ? parseFloat(row.exchange_rate) : undefined,
      convertedAmount: row.converted_amount ? parseFloat(row.converted_amount) : undefined,
      baseAmount: row.base_amount ? parseFloat(row.base_amount) : undefined,
      source: row.source || 'manual',
      connectionAccountId: row.connection_account_id ?? null,
      externalId: row.external_id ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async findByIdBasic(id: string): Promise<any | null> {
    const result = await this.dbToUse.query(
      `SELECT 
                t.*,
                a.name as account_name,
                c.name as category_name
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.id = $1`,
      [id],
    );
    return result.rows[0] || null;
  }

  async findByAccountId(accountId: string, limit = 100, offset = 0): Promise<Transaction[]> {
    const result = await this.dbToUse.query(
      'SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.account_id = $1 ORDER BY t.date DESC, t.id DESC LIMIT $2 OFFSET $3',
      [accountId, limit, offset],
    );
    return result.rows.map((row: any) => this.mapToEntity(row));
  }

  // ==================== CURSOR-BASED PAGINATION ====================

  /**
   * Decode cursor string to get id and date for pagination
   * Cursor format: base64("id-date")
   */
  private decodeCursor(cursor?: string): { id: string; date: string } | null {
    if (!cursor) return null;
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const [id, date] = decoded.split('|');
      if (!id) return null;
      // Return null if date is empty or undefined
      if (!date || date === 'undefined') return null;
      return { id, date };
    } catch {
      return null;
    }
  }

  /**
   * Encode transaction to cursor string
   * Cursor format: base64("id-date")
   */
  private encodeCursor(transaction: Transaction): string {
    const date = transaction.date;
    if (!date) {
      return Buffer.from(`${transaction.id}|`).toString('base64');
    }
    const dateStr = date instanceof Date ? date.toISOString() : String(date);
    return Buffer.from(`${transaction.id}|${dateStr}`).toString('base64');
  }

  /**
   * Build a cursor-based pagination query with shared filter logic
   */
  private buildCursorQuery(
    baseWhere: string,
    baseParams: any[],
    cursor: string | undefined,
    filters:
      | {
          type?: string;
          categoryId?: string;
          accountId?: string;
          startDate?: string;
          endDate?: string;
          search?: string;
        }
      | undefined,
    limit: number,
  ): { query: string; params: any[] } {
    let whereClause = baseWhere;
    const params: any[] = [...baseParams];
    let paramIndex = baseParams.length + 1;

    const cursorData = this.decodeCursor(cursor);
    if (cursorData) {
      whereClause += ` AND (t.date < $${paramIndex} OR (t.date = $${paramIndex} AND t.id < $${paramIndex + 1}))`;
      params.push(cursorData.date, cursorData.id);
      paramIndex += 2;
    }

    if (filters?.type) {
      whereClause += ` AND t.type = $${paramIndex}`;
      params.push(filters.type);
      paramIndex++;
    }
    if (filters?.categoryId) {
      whereClause += ` AND t.category_id = $${paramIndex}`;
      params.push(filters.categoryId);
      paramIndex++;
    }
    if (filters?.accountId) {
      whereClause += ` AND t.account_id = $${paramIndex}`;
      params.push(filters.accountId);
      paramIndex++;
    }
    if (filters?.startDate) {
      whereClause += ` AND t.date >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }
    if (filters?.endDate) {
      whereClause += ` AND t.date <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }
    if (filters?.search) {
      whereClause += ` AND (t.description ILIKE $${paramIndex} OR t.amount::text ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const query = `
            SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            ${whereClause}
            ORDER BY t.date DESC, t.id DESC
            LIMIT $${paramIndex}
        `;
    params.push(limit + 1);

    return { query, params };
  }

  private executeCursorQuery(
    query: string,
    params: any[],
    limit: number,
  ): Promise<PaginatedResult<Transaction>> {
    return this.dbToUse.query(query, params).then((result) => {
      const hasMore = result.rows.length > limit;
      const data = hasMore ? result.rows.slice(0, -1) : result.rows;
      return {
        data: data.map((row: any) => this.mapToEntityWithCategory(row)),
        pagination: {
          nextCursor: hasMore && data.length > 0 ? this.encodeCursor(data[data.length - 1]) : null,
          hasMore,
        },
      };
    });
  }

  /**
   * Find transactions by account ID with cursor-based pagination
   */
  async findByAccountIdCursor(
    accountId: string,
    options: CursorPaginationOptions,
    filters?: CursorFilters,
  ): Promise<PaginatedResult<Transaction>> {
    const { limit = 50, cursor } = options;
    const { query, params } = this.buildCursorQuery(
      'WHERE t.account_id = $1',
      [accountId],
      cursor,
      filters,
      limit,
    );
    return this.executeCursorQuery(query, params, limit);
  }

  /**
   * Find all transactions for a workspace with cursor-based pagination
   */
  async findByWorkspaceIdCursor(
    workspaceId: string,
    options: CursorPaginationOptions,
    filters?: {
      accountId?: string;
      categoryId?: string;
      category?: string;
      type?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    },
  ): Promise<PaginatedResult<Transaction>> {
    const { limit = 50, cursor } = options;
    const { query, params } = this.buildCursorQuery(
      'WHERE t.workspace_id = $1',
      [workspaceId],
      cursor,
      filters,
      limit,
    );
    return this.executeCursorQuery(query, params, limit);
  }

  async findByWorkspaceId(
    workspaceId: string,
    options: {
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
    } = {},
  ): Promise<{ transactions: Transaction[]; total: number }> {
    const {
      limit = 50,
      offset = 0,
      search,
      accountId,
      categoryId,
      category,
      type,
      startDate,
      endDate,
      linkedStatus,
    } = options;

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
    const countResult = await this.dbToUse.query(
      `SELECT COUNT(*) as total FROM transactions t ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.total || '0');

    // Get paginated results with category name
    const query = `
            SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            ${whereClause}
            ORDER BY t.date DESC, t.id DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

    const result = await this.dbToUse.query(query, [...params, limit, offset]);

    return {
      transactions: result.rows.map((row: any) => this.mapToEntityWithCategory(row)),
      total,
    };
  }

  async countByAccountThisMonth(accountId: string): Promise<number> {
    const result = await this.dbToUse.query(
      `SELECT COUNT(*) as count FROM transactions 
             WHERE account_id = $1 
             AND created_at >= date_trunc('month', NOW())`,
      [accountId],
    );
    return parseInt(result.rows[0]?.count || '0');
  }

  async countByWorkspaceId(workspaceId: string): Promise<number> {
    const result = await this.dbToUse.query(
      'SELECT COUNT(*) as count FROM transactions WHERE workspace_id = $1',
      [workspaceId],
    );
    return parseInt(result.rows[0]?.count || '0');
  }

  async countByCategoryId(categoryId: string): Promise<number> {
    const result = await this.dbToUse.query(
      'SELECT COUNT(*) as count FROM transactions WHERE category_id = $1',
      [categoryId],
    );
    return parseInt(result.rows[0]?.count || '0');
  }

  async reassignCategory(
    fromCategoryId: string,
    toCategoryId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.dbToUse.query(
      'UPDATE transactions SET category_id = $1, updated_at = NOW() WHERE category_id = $2 AND workspace_id = $3',
      [toCategoryId, fromCategoryId, workspaceId],
    );
  }

  // Get account stats: total income, expense, and balance (cached)
  async getAccountStats(
    accountId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<{
    totalIncome: number;
    totalExpense: number;
    balance: number;
    fromCache?: boolean;
  }> {
    const cacheKey = `txn:stats:${accountId}:${startDate || 'none'}:${endDate || 'none'}`;

    if (this.cache) {
      try {
        const cached = await this.cache.get<{
          totalIncome: number;
          totalExpense: number;
          balance: number;
        }>(cacheKey);
        if (cached) {
          return { ...cached, fromCache: true };
        }
      } catch (e) {
        console.log('[TransactionRepository] Redis cache unavailable, falling through to DB');
      }
    }

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

    const result = await this.dbToUse.query(
      `SELECT 
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
             FROM transactions ${whereClause}`,
      params,
    );

    const totalIncome = parseFloat(result.rows[0]?.total_income || '0');
    const totalExpense = parseFloat(result.rows[0]?.total_expense || '0');

    const stats = {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
    };

    if (this.cache) {
      try {
        await this.cache.set(cacheKey, stats, ACCOUNTS_STATS_TTL);
      } catch (e) {
        console.log('[TransactionRepository] Failed to cache stats in Redis');
      }
    }

    return { ...stats, fromCache: false };
  }

  // Invalidate cache when transactions change
  async invalidateAccountStatsCache(accountId: string): Promise<void> {
    if (this.cache) {
      try {
        // The key getAccountStats(accountId) caches under (no date range).
        // The old prefix-only key never matched anything, so it's kept only
        // for compatibility with entries written by older code.
        await this.cache.del(`txn:stats:${accountId}:none:none`);
        await this.cache.del(`txn:stats:${accountId}:`);
      } catch (e) {
        console.log('[TransactionRepository] Failed to invalidate stats cache in Redis');
      }
    }
  }

  // Get all account stats for a workspace
  async getWorkspaceAccountStats(
    workspaceId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<
    Array<{
      accountId: string;
      accountName: string;
      /** The account's currency: each row's figures are in it. */
      currency: string;
      totalIncome: number;
      totalExpense: number;
      balance: number;
    }>
  > {
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

    const result = await this.dbToUse.query(
      `SELECT 
                t.account_id,
                a.name as account_name,
                a.currency as currency,
                COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) as total_income,
                COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) as total_expense
             FROM transactions t
             JOIN accounts a ON t.account_id = a.id
             ${whereClause}
             GROUP BY t.account_id, a.name, a.currency
             ORDER BY a.name`,
      params,
    );

    return result.rows.map((row: any) => ({
      accountId: row.account_id,
      accountName: row.account_name,
      currency: row.currency,
      totalIncome: parseFloat(row.total_income),
      totalExpense: parseFloat(row.total_expense),
      balance: parseFloat(row.total_income) - parseFloat(row.total_expense),
    }));
  }

  /**
   * Workspace income/expense summed per currency. Totals across currencies
   * must be converted (TransactionService.getWorkspaceStats), never summed.
   */
  async getWorkspaceStatsByCurrency(
    workspaceId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<
    Array<{ currency: string; totalIncome: number; totalExpense: number; transactionCount: number }>
  > {
    const params: any[] = [workspaceId];
    let whereClause = 'WHERE workspace_id = $1';
    if (startDate) {
      params.push(startDate);
      whereClause += ` AND date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      whereClause += ` AND date <= $${params.length}`;
    }

    const result = await this.dbToUse.query(
      `SELECT
                COALESCE(currency, 'USD') as currency,
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
                COUNT(*) as transaction_count
             FROM transactions ${whereClause}
             GROUP BY COALESCE(currency, 'USD')
             ORDER BY 1`,
      params,
    );

    return result.rows.map((row: any) => ({
      currency: row.currency,
      totalIncome: parseFloat(row.total_income || '0'),
      totalExpense: parseFloat(row.total_expense || '0'),
      transactionCount: parseInt(row.transaction_count || '0'),
    }));
  }

  /** The workspace owner's preferred currency (Preferences), or null when unset. */
  async getWorkspaceOwnerCurrency(workspaceId: string): Promise<string | null> {
    const result = await this.dbToUse.query(
      `SELECT p.currency FROM workspaces w
         JOIN user_preferences p ON p.user_id = w.owner_id
        WHERE w.id = $1`,
      [workspaceId],
    );
    return result.rows[0]?.currency || null;
  }

  // Get workspace-wide stats (single-currency sum: mixed currencies are added as-is)
  async getWorkspaceStats(
    workspaceId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<{
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

    const result = await this.dbToUse.query(
      `SELECT 
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
                COUNT(*) as transaction_count
             FROM transactions ${whereClause}`,
      params,
    );

    const totalIncome = parseFloat(result.rows[0]?.total_income || '0');
    const totalExpense = parseFloat(result.rows[0]?.total_expense || '0');

    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      transactionCount: parseInt(result.rows[0]?.transaction_count || '0'),
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
      linked_transaction_ids: data.linkedTransactionIds || [],
      exchange_rate: data.exchangeRate,
      converted_amount: data.convertedAmount,
      base_amount: data.baseAmount,
      receipt_ids: data.receiptIds || [],
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

    const result = await this.dbToUse.query(query, values);
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
                linked_transaction_ids = $8,
                exchange_rate = $9,
                converted_amount = $10,
                base_amount = $11,
                receipt_ids = $12,
                updated_at = $13
            WHERE id = $14
            RETURNING *
        `;

    const result = await this.dbToUse.query(query, [
      data.accountId,
      data.type,
      data.amount,
      data.currency,
      data.description,
      data.date,
      data.categoryId,
      data.linkedTransactionIds || [],
      data.exchangeRate,
      data.convertedAmount,
      data.baseAmount,
      data.receiptIds || [],
      new Date(),
      transaction.id,
    ]);

    return this.mapToEntity(result.rows[0]);
  }

  /**
   * Synced rows in one multi-row INSERT; rows already imported for the same
   * link (same external id) are skipped by the partial unique index. Returns
   * how many were actually inserted.
   */
  async insertImported(rows: ImportedTransactionRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    const columns = [
      'account_id',
      'user_id',
      'workspace_id',
      'type',
      'amount',
      'currency',
      'description',
      'date',
      'merchant',
      'connection_account_id',
      'external_id',
      'source',
      'linked_transaction_ids',
      'receipt_ids',
    ];
    let inserted = 0;
    // Chunked to stay well under Postgres' 65535 bind-parameter limit.
    for (let start = 0; start < rows.length; start += 500) {
      const chunk = rows.slice(start, start + 500);
      const params: any[] = [];
      const tuples = chunk.map((row) => {
        const base = params.length;
        params.push(
          row.accountId,
          row.userId,
          row.workspaceId,
          row.type,
          row.amount,
          row.currency,
          row.description,
          row.date,
          row.counterparty ?? null,
          row.connectionAccountId,
          row.externalId,
          row.source,
        );
        const placeholders = Array.from({ length: 12 }, (_, i) => `$${base + i + 1}`);
        return `(${placeholders.join(', ')}, '{}'::uuid[], '{}'::uuid[])`;
      });
      const result = await this.dbToUse.query(
        `INSERT INTO transactions (${columns.join(', ')})
         VALUES ${tuples.join(', ')}
         ON CONFLICT (connection_account_id, external_id)
           WHERE connection_account_id IS NOT NULL AND external_id IS NOT NULL
         DO NOTHING`,
        params,
      );
      inserted += result.rowCount ?? 0;
    }
    return inserted;
  }

  /** Removes a link's synced and adjustment rows (unlink with "delete imported"). */
  async deleteImportedForLink(connectionAccountId: string): Promise<number> {
    const result = await this.dbToUse.query(
      'DELETE FROM transactions WHERE connection_account_id = $1',
      [connectionAccountId],
    );
    return result.rowCount ?? 0;
  }

  /** Unlink with "keep": the link's rows become plain transactions. */
  async releaseImportedForLink(connectionAccountId: string): Promise<number> {
    const result = await this.dbToUse.query(
      `UPDATE transactions
          SET connection_account_id = NULL, external_id = NULL, source = 'manual', updated_at = NOW()
        WHERE connection_account_id = $1`,
      [connectionAccountId],
    );
    return result.rowCount ?? 0;
  }

  /** Removes one synced row of a link (the day's balance adjustment, or the opening balance, before it's rewritten). */
  async deleteLinkRow(connectionAccountId: string, externalId: string): Promise<void> {
    await this.dbToUse.query(
      'DELETE FROM transactions WHERE connection_account_id = $1 AND external_id = $2',
      [connectionAccountId, externalId],
    );
  }

  /** Date of a link's oldest synced movement (not adjustments), or null. */
  async oldestSyncedDate(connectionAccountId: string): Promise<Date | null> {
    const result = await this.dbToUse.query(
      `SELECT MIN(date) AS oldest FROM transactions
        WHERE connection_account_id = $1 AND source = 'sync'`,
      [connectionAccountId],
    );
    return result.rows[0]?.oldest ? new Date(result.rows[0].oldest) : null;
  }

  /** Income minus expense for an account as an exact decimal string (no cache, no float). */
  async getAccountBalanceExact(accountId: string): Promise<string> {
    const result = await this.dbToUse.query(
      `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0)::text AS balance
         FROM transactions WHERE account_id = $1`,
      [accountId],
    );
    return result.rows[0]?.balance ?? '0';
  }

  async delete(id: string): Promise<void> {
    await this.dbToUse.query('DELETE FROM transactions WHERE id = $1', [id]);
  }

  async deleteByWorkspaceId(workspaceId: string): Promise<void> {
    await this.dbToUse.query('DELETE FROM transactions WHERE workspace_id = $1', [workspaceId]);
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
      linkedTransactionIds: row.linked_transaction_ids || [],
      exchangeRate: row.exchange_rate ? parseFloat(row.exchange_rate) : undefined,
      convertedAmount: row.converted_amount ? parseFloat(row.converted_amount) : undefined,
      baseAmount: row.base_amount ? parseFloat(row.base_amount) : undefined,
      receiptIds: row.receipt_ids || [],
      source: row.source || 'manual',
      connectionAccountId: row.connection_account_id ?? null,
      externalId: row.external_id ?? null,
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
      linkedTransactionIds: row.linked_transaction_ids || [],
      exchangeRate: row.exchange_rate ? parseFloat(row.exchange_rate) : undefined,
      convertedAmount: row.converted_amount ? parseFloat(row.converted_amount) : undefined,
      baseAmount: row.base_amount ? parseFloat(row.base_amount) : undefined,
      receiptIds: row.receipt_ids || [],
      source: row.source || 'manual',
      connectionAccountId: row.connection_account_id ?? null,
      externalId: row.external_id ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return Transaction.restore(props, row.id);
  }
}
