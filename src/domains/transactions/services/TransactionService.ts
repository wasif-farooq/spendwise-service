import { TransactionRepository } from '../repositories/TransactionRepository';
import { Transaction } from '../models/Transaction';
import { AppError } from '@shared/errors/AppError';
import { IAccountRepository } from '@domains/accounts/repositories/IAccountRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { ExchangeRateService } from '@domains/exchange-rates/services/ExchangeRateService';
import { CursorPaginationOptions, CursorFilters, PaginatedResult } from '../repositories/types';
import { ActivityCaptureService } from '@shared/ActivityCaptureService';
import { roundAmount } from '@domains/currencies/currencies';
import { TotalsConverter } from '@domains/currencies/TotalsConverter';

export interface CreateTransactionDTO {
  accountId: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  description?: string;
  date: string;
  categoryId?: string;
  linkedTransactionIds?: string[];
  exchangeRate?: number;
  receiptIds?: string[];
}

export interface UpdateTransactionDTO {
  accountId?: string;
  type?: 'income' | 'expense';
  amount?: number;
  currency?: string;
  description?: string;
  date?: string;
  category?: string;
  categoryId?: string;
  linkedTransactionIds?: string[] | null;
  exchangeRate?: number;
  receiptIds?: string[];
}

export interface LinkTransactionDTO {
  linkedTransactionId: string;
}

export interface UnlinkTransactionDTO {
  linkedId: string;
}

export interface TransferDTO {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  exchangeRate?: number; // optional - if provided, use it; otherwise fetch from DB
  date: string;
  description?: string;
}

export interface TransferResult {
  withdraw: Transaction;
  deposit: Transaction;
}

export class TransactionService {
  constructor(
    private transactionRepo: TransactionRepository,
    private accountRepo: IAccountRepository,
    private db: DatabaseFacade,
    private exchangeRateService?: ExchangeRateService,
    private activityCapture?: ActivityCaptureService,
  ) {}

  /**
   * Confirm an account belongs to the caller's workspace.
   *
   * Route middleware proves the caller is a member of `:workspaceId`, but the
   * account id arrives from the request body or path and is otherwise
   * unchecked — without this, a member of one workspace can post against
   * another workspace's account and corrupt its balance.
   *
   * Responds 404 rather than 403 so the endpoint does not confirm whether an
   * account id exists in some other workspace.
   */
  private async assertAccountInWorkspace(
    accountId: string,
    workspaceId: string,
    trxDb?: DatabaseFacade,
  ): Promise<void> {
    if (!accountId) {
      throw new AppError('Account not found', 404);
    }

    const repo = trxDb ? this.accountRepo.withDb(trxDb) : this.accountRepo;
    const account = await repo.findById(accountId);

    if (!account || account.workspaceId !== workspaceId) {
      throw new AppError('Account not found', 404);
    }
  }

  /**
   * Confirm every referenced transaction belongs to the caller's workspace.
   * Linking writes to both sides, so an unchecked id is a write into another
   * workspace's data.
   */
  private async assertTransactionsInWorkspace(
    transactionIds: string[],
    workspaceId: string,
    trxDb?: DatabaseFacade,
  ): Promise<void> {
    const repo = trxDb ? this.transactionRepo.withDb(trxDb) : this.transactionRepo;

    for (const transactionId of transactionIds) {
      const transaction = await repo.findById(transactionId);
      if (!transaction || transaction.workspaceId !== workspaceId) {
        throw new AppError('Linked transaction not found', 404);
      }
    }
  }

  // Helper to recalculate and update account balance, totalIncome, totalExpense (uses transaction if provided)
  private async updateAccountBalance(accountId: string, trxDb?: DatabaseFacade): Promise<void> {
    const stats = trxDb
      ? await this.transactionRepo.withDb(trxDb).getAccountStats(accountId)
      : await this.transactionRepo.getAccountStats(accountId);

    if (trxDb) {
      await this.accountRepo
        .withDb(trxDb)
        .updateIncomeExpense(accountId, stats.totalIncome, stats.totalExpense);
    } else {
      await this.accountRepo.updateIncomeExpense(accountId, stats.totalIncome, stats.totalExpense);
    }
  }

  // Transfer funds between accounts with currency conversion
  async transfer(data: TransferDTO, userId: string, workspaceId: string): Promise<TransferResult> {
    // Validate accounts exist
    const fromAccount = await this.accountRepo.findById(data.fromAccountId);
    if (!fromAccount) {
      throw new AppError('Source account not found', 404);
    }

    const toAccount = await this.accountRepo.findById(data.toAccountId);
    if (!toAccount) {
      throw new AppError('Destination account not found', 404);
    }

    // Both accounts must belong to the *caller's* workspace. Checking them
    // only against each other let a member of one workspace move money
    // between two accounts of another.
    if (fromAccount.workspaceId !== workspaceId || toAccount.workspaceId !== workspaceId) {
      throw new AppError('Account not found', 404);
    }

    // Validate not transferring to same account
    if (data.fromAccountId === data.toAccountId) {
      throw new AppError('Cannot transfer to the same account', 400);
    }

    // Check sufficient balance
    const fromStats = await this.transactionRepo.getAccountStats(data.fromAccountId);
    if (fromStats.balance < data.amount) {
      throw new AppError('Insufficient balance', 400);
    }

    // Get exchange rate
    let exchangeRate: number;
    let convertedAmount: number;

    if (data.exchangeRate) {
      // Use provided exchange rate
      exchangeRate = data.exchangeRate;
      convertedAmount = roundAmount(data.amount * exchangeRate, toAccount.currency);
    } else if (this.exchangeRateService) {
      // Fetch from exchange rate service
      const conversion = await this.exchangeRateService.convert(
        data.amount,
        data.currency,
        toAccount.currency,
      );
      exchangeRate = conversion.rate;
      convertedAmount = roundAmount(conversion.convertedAmount, toAccount.currency);
    } else if (fromAccount.currency === toAccount.currency) {
      // Same currency - no conversion needed
      exchangeRate = 1;
      convertedAmount = data.amount;
    } else {
      throw new AppError('Exchange rate not available. Please provide one.', 400);
    }

    return this.db.transaction(async (trxDb) => {
      const trxTransactionRepo = this.transactionRepo.withDb(trxDb);
      const trxAccountRepo = this.accountRepo.withDb(trxDb);

      // Create withdraw transaction (expense) on source account
      const withdrawTx = Transaction.create({
        accountId: data.fromAccountId,
        userId,
        workspaceId,
        type: 'expense',
        amount: data.amount,
        currency: data.currency,
        description: data.description || `Transfer to ${toAccount.name}`,
        date: new Date(data.date),
        linkedTransactionIds: [],
        exchangeRate,
        convertedAmount,
      });

      const savedWithdraw = await trxTransactionRepo.save(withdrawTx);

      // Create deposit transaction (income) on destination account
      const depositTx = Transaction.create({
        accountId: data.toAccountId,
        userId,
        workspaceId,
        type: 'income',
        amount: convertedAmount,
        currency: toAccount.currency,
        description: data.description || `Transfer from ${fromAccount.name}`,
        date: new Date(data.date),
        linkedTransactionIds: [savedWithdraw.id],
        exchangeRate,
        convertedAmount: data.amount, // store original amount
      });

      const savedDeposit = await trxTransactionRepo.save(depositTx);

      // Update withdraw to reference the deposit
      const updatedWithdraw = Transaction.restore(
        {
          ...savedWithdraw.getProps(),
          linkedTransactionIds: [savedDeposit.id],
        },
        savedWithdraw.id,
      );
      await trxTransactionRepo.update(updatedWithdraw);

      // Update both account balances
      trxTransactionRepo.invalidateAccountStatsCache(data.fromAccountId);
      const fromStats = await trxTransactionRepo.getAccountStats(data.fromAccountId);
      await trxAccountRepo.updateBalance(data.fromAccountId, fromStats.balance);

      trxTransactionRepo.invalidateAccountStatsCache(data.toAccountId);
      const toStats = await trxTransactionRepo.getAccountStats(data.toAccountId);
      await trxAccountRepo.updateBalance(data.toAccountId, toStats.balance);

      return {
        withdraw: updatedWithdraw,
        deposit: savedDeposit,
      };
    });
  }

  async getTransactionsByWorkspace(
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
  ) {
    return this.transactionRepo.findByWorkspaceId(workspaceId, options);
  }

  async getTransactionsByAccount(
    accountId: string,
    workspaceId: string,
    limit = 100,
    offset = 0,
  ): Promise<Transaction[]> {
    await this.assertAccountInWorkspace(accountId, workspaceId);
    return this.transactionRepo.findByAccountId(accountId, limit, offset);
  }

  // ==================== CURSOR-BASED PAGINATION ====================

  /**
   * Get transactions by account with cursor-based pagination
   */
  async getTransactionsByAccountCursor(
    accountId: string,
    workspaceId: string,
    options: CursorPaginationOptions,
    filters?: CursorFilters,
  ): Promise<PaginatedResult<Transaction>> {
    await this.assertAccountInWorkspace(accountId, workspaceId);
    return this.transactionRepo.findByAccountIdCursor(accountId, options, filters);
  }

  /**
   * Get all transactions for a workspace with cursor-based pagination
   */
  async getTransactionsByWorkspaceCursor(
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
    return this.transactionRepo.findByWorkspaceIdCursor(workspaceId, options, filters);
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    return this.transactionRepo.findById(id);
  }

  async getTransactionWithDetails(id: string, workspaceId: string): Promise<any> {
    const transaction = await this.transactionRepo.findByIdWithDetails(id);
    if (!transaction || transaction.workspaceId !== workspaceId) {
      throw new AppError('Transaction not found', 404);
    }
    return transaction;
  }

  async createTransaction(
    data: CreateTransactionDTO,
    userId: string,
    workspaceId: string,
  ): Promise<Transaction> {
    return this.db.transaction(async (trxDb) => {
      const trxTransactionRepo = this.transactionRepo.withDb(trxDb);
      const trxAccountRepo = this.accountRepo.withDb(trxDb);

      // accountId comes from the request body and is not covered by the
      // route's workspace permission check.
      await this.assertAccountInWorkspace(data.accountId, workspaceId, trxDb);

      if (data.linkedTransactionIds?.length) {
        await this.assertTransactionsInWorkspace(data.linkedTransactionIds, workspaceId, trxDb);
      }

      const transaction = Transaction.create({
        accountId: data.accountId,
        userId,
        workspaceId,
        type: data.type,
        amount: data.amount,
        currency: data.currency,
        description: data.description,
        date: new Date(data.date),
        categoryId: data.categoryId,
        linkedTransactionIds: data.linkedTransactionIds || [],
        exchangeRate: data.exchangeRate,
        receiptIds: data.receiptIds || [],
      });

      const saved = await trxTransactionRepo.save(transaction);

      // Invalidate stats cache and update account balance
      trxTransactionRepo.invalidateAccountStatsCache(data.accountId);
      const stats = await trxTransactionRepo.getAccountStats(data.accountId);
      await trxAccountRepo.updateBalance(data.accountId, stats.balance);

      // If linking to transactions, update them as well (bidirectional)
      if (data.linkedTransactionIds && data.linkedTransactionIds.length > 0) {
        for (const linkedTxId of data.linkedTransactionIds) {
          const linkedTx = await trxTransactionRepo.findById(linkedTxId);
          if (linkedTx) {
            const linkedProps = linkedTx.getProps();
            const existingLinkedIds = linkedProps.linkedTransactionIds || [];
            if (!existingLinkedIds.includes(saved.id)) {
              const updatedLinked = Transaction.restore(
                {
                  ...linkedProps,
                  linkedTransactionIds: [...existingLinkedIds, saved.id],
                },
                linkedTx.id,
              );
              await trxTransactionRepo.update(updatedLinked);
            }
          }
        }
      }

      if (this.activityCapture) {
        this.activityCapture
          .log(
            {
              entityType: 'transaction',
              entityId: saved.id,
              action: 'create',
              newValues: saved.toJSON(),
            },
            {
              workspaceId,
              userId,
            },
          )
          .catch(() => {});
      }

      return saved;
    });
  }

  async updateTransaction(
    id: string,
    data: UpdateTransactionDTO,
    workspaceId: string,
    userId?: string,
  ): Promise<Transaction> {
    return this.db.transaction(async (trxDb) => {
      const trxTransactionRepo = this.transactionRepo.withDb(trxDb);
      const trxAccountRepo = this.accountRepo.withDb(trxDb);

      const existing = await trxTransactionRepo.findById(id);
      if (!existing) {
        throw new AppError('Transaction not found', 404);
      }

      if (existing.workspaceId !== workspaceId) {
        throw new AppError('Transaction not found', 404);
      }

      // Reassigning the account must not move the transaction (and its
      // balance recalculation) onto another workspace's account.
      if (data.accountId) {
        await this.assertAccountInWorkspace(data.accountId, workspaceId, trxDb);
      }

      if (data.linkedTransactionIds?.length) {
        await this.assertTransactionsInWorkspace(data.linkedTransactionIds, workspaceId, trxDb);
      }

      const oldValues = existing.toJSON();
      const updatedProps = existing.getProps();
      const oldAccountId = existing.accountId;

      const updatedTransaction = Transaction.restore(
        {
          accountId: data.accountId || updatedProps.accountId,
          userId: updatedProps.userId,
          workspaceId: updatedProps.workspaceId,
          type: (data.type as 'income' | 'expense') || updatedProps.type,
          amount: data.amount ?? updatedProps.amount,
          currency: data.currency || updatedProps.currency,
          description: data.description ?? updatedProps.description,
          date: data.date ? new Date(data.date) : updatedProps.date,
          categoryId: data.categoryId ?? updatedProps.categoryId,
          categoryName: data.category ?? updatedProps.categoryName,
          linkedTransactionIds:
            data.linkedTransactionIds !== undefined
              ? data.linkedTransactionIds || []
              : updatedProps.linkedTransactionIds,
          exchangeRate: data.exchangeRate ?? updatedProps.exchangeRate,
          baseAmount: updatedProps.baseAmount,
          receiptIds: data.receiptIds ?? updatedProps.receiptIds,
          createdAt: updatedProps.createdAt,
          updatedAt: new Date(),
        },
        id,
      );

      const saved = await trxTransactionRepo.update(updatedTransaction);

      if (this.activityCapture) {
        this.activityCapture
          .log(
            {
              entityType: 'transaction',
              entityId: id,
              action: 'update',
              oldValues,
              newValues: saved.toJSON(),
            },
            {
              workspaceId,
              userId: userId || existing.userId,
            },
          )
          .catch(() => {});
      }

      // Invalidate cache and update balance for old and new account if account changed
      trxTransactionRepo.invalidateAccountStatsCache(oldAccountId);
      const oldStats = await trxTransactionRepo.getAccountStats(oldAccountId);
      await trxAccountRepo.updateBalance(oldAccountId, oldStats.balance);

      if (data.accountId && data.accountId !== oldAccountId) {
        trxTransactionRepo.invalidateAccountStatsCache(data.accountId);
        const newStats = await trxTransactionRepo.getAccountStats(data.accountId);
        await trxAccountRepo.updateBalance(data.accountId, newStats.balance);
      }

      return saved;
    });
  }

  async linkTransaction(
    id: string,
    dto: LinkTransactionDTO,
    workspaceId: string,
  ): Promise<Transaction> {
    const existing = await this.transactionRepo.findById(id);
    if (!existing) {
      throw new AppError('Transaction not found', 404);
    }

    if (existing.workspaceId !== workspaceId) {
      throw new AppError('Transaction not found', 404);
    }

    // Verify the linked transaction exists and is in the same workspace —
    // linking writes back to it, so an unscoped id is a cross-workspace write.
    const linkedTx = await this.transactionRepo.findById(dto.linkedTransactionId);
    if (!linkedTx || linkedTx.workspaceId !== workspaceId) {
      throw new AppError('Linked transaction not found', 404);
    }

    const updatedProps = existing.getProps();
    const currentLinkedIds = updatedProps.linkedTransactionIds || [];

    // Don't add if already linked
    if (currentLinkedIds.includes(dto.linkedTransactionId)) {
      throw new AppError('Transaction already linked', 400);
    }

    const updatedTransaction = Transaction.restore(
      {
        ...updatedProps,
        linkedTransactionIds: [...currentLinkedIds, dto.linkedTransactionId],
      },
      id,
    );

    const saved = await this.transactionRepo.update(updatedTransaction);

    // Update the linked transaction to reference back (bidirectional)
    const linkedProps = linkedTx.getProps();
    const existingLinkedBackIds = linkedProps.linkedTransactionIds || [];
    if (!existingLinkedBackIds.includes(id)) {
      const updatedLinked = Transaction.restore(
        {
          ...linkedProps,
          linkedTransactionIds: [...existingLinkedBackIds, id],
        },
        dto.linkedTransactionId,
      );
      await this.transactionRepo.update(updatedLinked);
    }

    return saved;
  }

  async unlinkTransaction(
    id: string,
    dto: UnlinkTransactionDTO,
    workspaceId: string,
  ): Promise<Transaction> {
    const existing = await this.transactionRepo.findById(id);
    if (!existing) {
      throw new AppError('Transaction not found', 404);
    }

    if (existing.workspaceId !== workspaceId) {
      throw new AppError('Transaction not found', 404);
    }

    const linkedIdToRemove = dto.linkedId;
    const updatedProps = existing.getProps();
    const currentLinkedIds = updatedProps.linkedTransactionIds || [];

    // Filter out the linked transaction to remove
    const updatedLinkedIds = currentLinkedIds.filter((linkedId) => linkedId !== linkedIdToRemove);

    const updatedTransaction = Transaction.restore(
      {
        ...updatedProps,
        linkedTransactionIds: updatedLinkedIds,
      },
      id,
    );

    const saved = await this.transactionRepo.update(updatedTransaction);

    // Also remove the link from the linked transaction (bidirectional).
    // Scoped to the workspace so this cannot write to a foreign transaction.
    const linkedTx = await this.transactionRepo.findById(linkedIdToRemove);
    if (linkedTx && linkedTx.workspaceId === workspaceId) {
      const linkedProps = linkedTx.getProps();
      const linkedBackIds = (linkedProps.linkedTransactionIds || []).filter(
        (linkedId) => linkedId !== id,
      );
      const updatedLinked = Transaction.restore(
        {
          ...linkedProps,
          linkedTransactionIds: linkedBackIds,
        },
        linkedIdToRemove,
      );
      await this.transactionRepo.update(updatedLinked);
    }

    return saved;
  }

  async deleteTransaction(id: string, workspaceId: string, userId?: string): Promise<void> {
    return this.db.transaction(async (trxDb) => {
      const trxTransactionRepo = this.transactionRepo.withDb(trxDb);
      const trxAccountRepo = this.accountRepo.withDb(trxDb);

      const existing = await trxTransactionRepo.findById(id);
      if (!existing) {
        throw new AppError('Transaction not found', 404);
      }

      if (existing.workspaceId !== workspaceId) {
        throw new AppError('Transaction not found', 404);
      }

      const accountId = existing.accountId;
      const oldValues = existing.toJSON();

      const linkedIds = existing.linkedTransactionIds || [];
      if (linkedIds.length > 0) {
        await this.unlinkTransactionInTransaction(id, workspaceId, trxDb);
      }

      await trxTransactionRepo.delete(id);

      if (this.activityCapture) {
        this.activityCapture
          .log(
            {
              entityType: 'transaction',
              entityId: id,
              action: 'delete',
              oldValues,
            },
            {
              workspaceId,
              userId: userId || existing.userId,
            },
          )
          .catch(() => {});
      }

      trxTransactionRepo.invalidateAccountStatsCache(accountId);
      const stats = await trxTransactionRepo.getAccountStats(accountId);
      await trxAccountRepo.updateBalance(accountId, stats.balance);
    });
  }

  // Helper for unlink within a transaction
  private async unlinkTransactionInTransaction(
    id: string,
    workspaceId: string,
    trxDb: DatabaseFacade,
  ): Promise<void> {
    const trxTransactionRepo = this.transactionRepo.withDb(trxDb);

    const existing = await trxTransactionRepo.findById(id);
    if (!existing) return;

    const linkedIds = existing.linkedTransactionIds || [];

    const updatedProps = existing.getProps();

    const updatedTransaction = Transaction.restore(
      {
        ...updatedProps,
        linkedTransactionIds: [],
      },
      id,
    );

    await trxTransactionRepo.update(updatedTransaction);

    // Also unlink from all linked transactions
    for (const linkedTxId of linkedIds) {
      const linkedTx = await trxTransactionRepo.findById(linkedTxId);
      if (linkedTx) {
        const linkedProps = linkedTx.getProps();
        const filteredIds = (linkedProps.linkedTransactionIds || []).filter((txId) => txId !== id);
        const updatedLinked = Transaction.restore(
          {
            ...linkedProps,
            linkedTransactionIds: filteredIds,
          },
          linkedTxId,
        );
        await trxTransactionRepo.update(updatedLinked);
      }
    }
  }

  // Stats methods
  async getAccountStats(
    accountId: string,
    workspaceId: string,
    startDate?: string,
    endDate?: string,
  ) {
    await this.assertAccountInWorkspace(accountId, workspaceId);
    return this.transactionRepo.getAccountStats(accountId, startDate, endDate);
  }

  async getWorkspaceAccountStats(workspaceId: string, startDate?: string, endDate?: string) {
    return this.transactionRepo.getWorkspaceAccountStats(workspaceId, startDate, endDate);
  }

  /**
   * Workspace totals in one currency: `currency` if given, else the workspace
   * owner's preferred currency, else USD. Sums are taken per currency and
   * converted; currencies with no rate are left out and listed in
   * `unconvertedCurrencies`.
   */
  async getWorkspaceStats(
    workspaceId: string,
    startDate?: string,
    endDate?: string,
    currency?: string,
  ): Promise<{
    totalIncome: number;
    totalExpense: number;
    balance: number;
    transactionCount: number;
    currency: string;
    unconvertedCurrencies: string[];
  }> {
    const target = (currency || (await this.ownerCurrency(workspaceId)) || 'USD').toUpperCase();
    const rows = await this.transactionRepo.getWorkspaceStatsByCurrency(
      workspaceId,
      startDate,
      endDate,
    );
    const service = this.exchangeRateService;
    const converter = new TotalsConverter(
      target,
      service ? async (from, to) => (await service.convert(1, from, to)).rate : undefined,
    );

    let totalIncome = 0;
    let totalExpense = 0;
    let transactionCount = 0;
    for (const row of rows) {
      transactionCount += row.transactionCount;
      const income = await converter.convert(row.totalIncome, row.currency);
      const expense = await converter.convert(row.totalExpense, row.currency);
      if (income !== null) totalIncome += income;
      if (expense !== null) totalExpense += expense;
    }

    return {
      totalIncome: roundAmount(totalIncome, target),
      totalExpense: roundAmount(totalExpense, target),
      balance: roundAmount(totalIncome - totalExpense, target),
      transactionCount,
      currency: target,
      unconvertedCurrencies: converter.unconvertedCurrencies(),
    };
  }

  private async ownerCurrency(workspaceId: string): Promise<string | null> {
    try {
      const result = await this.db.query(
        `SELECT p.currency FROM workspaces w
           JOIN user_preferences p ON p.user_id = w.owner_id
          WHERE w.id = $1`,
        [workspaceId],
      );
      return result.rows[0]?.currency || null;
    } catch {
      return null;
    }
  }
}
