import { TransactionRepository } from '../repositories/TransactionRepository';
import { Transaction } from '../models/Transaction';
import { AppError } from '@shared/errors/AppError';
import { IAccountRepository } from '@domains/accounts/repositories/IAccountRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { ExchangeRateService } from '@domains/exchange-rates/services/ExchangeRateService';

export interface CreateTransactionDTO {
    accountId: string;
    type: 'income' | 'expense';
    amount: number;
    currency: string;
    description?: string;
    date: string;
    categoryId?: string;
    // For linked transactions (replaces transfer)
    linkedTransactionId?: string;
    linkedAccountId?: string;
    exchangeRate?: number;
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
    linkedTransactionId?: string;
    linkedAccountId?: string;
    exchangeRate?: number;
}

export interface LinkTransactionDTO {
    linkedTransactionId: string;
    linkedAccountId: string;
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
        private exchangeRateService?: ExchangeRateService
    ) { }

    // Helper to recalculate and update account balance, totalIncome, totalExpense (uses transaction if provided)
    private async updateAccountBalance(accountId: string, trxDb?: DatabaseFacade): Promise<void> {
        const stats = trxDb 
            ? await this.transactionRepo.withDb(trxDb).getAccountStats(accountId)
            : await this.transactionRepo.getAccountStats(accountId);
        
        if (trxDb) {
            await this.accountRepo.withDb(trxDb).updateIncomeExpense(accountId, stats.totalIncome, stats.totalExpense);
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

        // Validate both accounts belong to same organization
        if (fromAccount.workspaceId !== toAccount.workspaceId) {
            throw new AppError('Accounts must belong to the same organization', 400);
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
            convertedAmount = data.amount * exchangeRate;
        } else if (this.exchangeRateService) {
            // Fetch from exchange rate service
            const conversion = await this.exchangeRateService.convert(
                data.amount,
                data.currency,
                toAccount.currency
            );
            exchangeRate = conversion.rate;
            convertedAmount = conversion.convertedAmount;
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
                linkedAccountId: data.toAccountId,
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
                linkedAccountId: data.fromAccountId,
                linkedTransactionId: savedWithdraw.id,
                exchangeRate,
                convertedAmount: data.amount, // store original amount
            });

            const savedDeposit = await trxTransactionRepo.save(depositTx);

            // Update withdraw to reference the deposit
            const updatedWithdraw = Transaction.restore({
                ...savedWithdraw.getProps(),
                linkedTransactionId: savedDeposit.id,
            }, savedWithdraw.id);
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

    async getTransactionsByWorkspace(workspaceId: string, options: {
        limit?: number;
        offset?: number;
        search?: string;
        accountId?: string;
        categoryId?: string;
        startDate?: string;
        endDate?: string;
    } = {}) {
        return this.transactionRepo.findByWorkspaceId(workspaceId, options);
    }

    async getTransactionsByAccount(accountId: string, limit = 100, offset = 0): Promise<Transaction[]> {
        return this.transactionRepo.findByAccountId(accountId, limit, offset);
    }

    async getTransactionById(id: string): Promise<Transaction | null> {
        return this.transactionRepo.findById(id);
    }

    async createTransaction(data: CreateTransactionDTO, userId: string, workspaceId: string): Promise<Transaction> {
        return this.db.transaction(async (trxDb) => {
            const trxTransactionRepo = this.transactionRepo.withDb(trxDb);
            const trxAccountRepo = this.accountRepo.withDb(trxDb);

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
                linkedTransactionId: data.linkedTransactionId,
                linkedAccountId: data.linkedAccountId,
                exchangeRate: data.exchangeRate,
            });

            const saved = await trxTransactionRepo.save(transaction);

            // Invalidate stats cache and update account balance
            trxTransactionRepo.invalidateAccountStatsCache(data.accountId);
            const stats = await trxTransactionRepo.getAccountStats(data.accountId);
            await trxAccountRepo.updateBalance(data.accountId, stats.balance);

            // If linking to another transaction, update the linked transaction
            if (data.linkedTransactionId && data.linkedAccountId) {
                const linkedTx = await trxTransactionRepo.findById(data.linkedTransactionId);
                if (linkedTx) {
                    const linkedProps = linkedTx.getProps();
                    const updatedLinked = Transaction.create({
                        ...linkedProps,
                        linkedTransactionId: saved.id,
                        linkedAccountId: data.accountId,
                    });
                    (updatedLinked as any).id = linkedTx.id;
                    await trxTransactionRepo.update(updatedLinked);
                    // Invalidate cache and update balance for linked account too
                    trxTransactionRepo.invalidateAccountStatsCache(data.linkedAccountId);
                    const linkedStats = await trxTransactionRepo.getAccountStats(data.linkedAccountId);
                    await trxAccountRepo.updateBalance(data.linkedAccountId, linkedStats.balance);
                }
            }

            return saved;
        });
    }

    async updateTransaction(id: string, data: UpdateTransactionDTO, workspaceId: string): Promise<Transaction> {
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

            const updatedProps = existing.getProps();
            const oldAccountId = existing.accountId;
            
            const updatedTransaction = Transaction.restore({
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
                linkedTransactionId: data.linkedTransactionId ?? updatedProps.linkedTransactionId,
                linkedAccountId: data.linkedAccountId ?? updatedProps.linkedAccountId,
                exchangeRate: data.exchangeRate ?? updatedProps.exchangeRate,
                baseAmount: updatedProps.baseAmount,
                createdAt: updatedProps.createdAt,
                updatedAt: new Date(),
            }, id);
            
            const saved = await trxTransactionRepo.update(updatedTransaction);

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

    async linkTransaction(id: string, dto: LinkTransactionDTO, workspaceId: string): Promise<Transaction> {
        const existing = await this.transactionRepo.findById(id);
        if (!existing) {
            throw new AppError('Transaction not found', 404);
        }

        if (existing.workspaceId !== workspaceId) {
            throw new AppError('Transaction not found', 404);
        }

        // Verify the linked transaction exists
        const linkedTx = await this.transactionRepo.findById(dto.linkedTransactionId);
        if (!linkedTx) {
            throw new AppError('Linked transaction not found', 404);
        }

        const updatedProps = existing.getProps();
        
        const updatedTransaction = Transaction.create({
            ...updatedProps,
            linkedTransactionId: dto.linkedTransactionId,
            linkedAccountId: dto.linkedAccountId,
        });

        (updatedTransaction as any).id = id;
        
        const saved = await this.transactionRepo.update(updatedTransaction);

        // Update the linked transaction to reference back
        const linkedProps = linkedTx.getProps();
        const updatedLinked = Transaction.create({
            ...linkedProps,
            linkedTransactionId: id,
            linkedAccountId: existing.accountId,
        });
        (updatedLinked as any).id = dto.linkedTransactionId;
        await this.transactionRepo.update(updatedLinked);

        return saved;
    }

    async unlinkTransaction(id: string, workspaceId: string): Promise<Transaction> {
        const existing = await this.transactionRepo.findById(id);
        if (!existing) {
            throw new AppError('Transaction not found', 404);
        }

        if (existing.workspaceId !== workspaceId) {
            throw new AppError('Transaction not found', 404);
        }

        const linkedTxId = existing.linkedTransactionId;
        
        const updatedProps = existing.getProps();
        
        const updatedTransaction = Transaction.create({
            ...updatedProps,
            linkedTransactionId: undefined,
            linkedAccountId: undefined,
        });

        (updatedTransaction as any).id = id;
        
        const saved = await this.transactionRepo.update(updatedTransaction);

        // Also unlink the linked transaction
        if (linkedTxId) {
            const linkedTx = await this.transactionRepo.findById(linkedTxId);
            if (linkedTx) {
                const linkedProps = linkedTx.getProps();
                const updatedLinked = Transaction.create({
                    ...linkedProps,
                    linkedTransactionId: undefined,
                    linkedAccountId: undefined,
                });
                (updatedLinked as any).id = linkedTxId;
                await this.transactionRepo.update(updatedLinked);
            }
        }

        return saved;
    }

    async deleteTransaction(id: string, workspaceId: string): Promise<void> {
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

            // Store accountId before deleting for cache invalidation
            const accountId = existing.accountId;

            // Unlink from linked transaction before deleting
            if (existing.linkedTransactionId) {
                await this.unlinkTransactionInTransaction(id, workspaceId, trxDb);
            }

            await trxTransactionRepo.delete(id);

            // Invalidate stats cache and update account balance
            trxTransactionRepo.invalidateAccountStatsCache(accountId);
            const stats = await trxTransactionRepo.getAccountStats(accountId);
            await trxAccountRepo.updateBalance(accountId, stats.balance);
        });
    }

    // Helper for unlink within a transaction
    private async unlinkTransactionInTransaction(id: string, workspaceId: string, trxDb: DatabaseFacade): Promise<void> {
        const trxTransactionRepo = this.transactionRepo.withDb(trxDb);
        
        const existing = await trxTransactionRepo.findById(id);
        if (!existing) return;

        const linkedTxId = existing.linkedTransactionId;
        
        const updatedProps = existing.getProps();
        
        const updatedTransaction = Transaction.create({
            ...updatedProps,
            linkedTransactionId: undefined,
            linkedAccountId: undefined,
        });

        (updatedTransaction as any).id = id;
        
        await trxTransactionRepo.update(updatedTransaction);

        // Also unlink the linked transaction
        if (linkedTxId) {
            const linkedTx = await trxTransactionRepo.findById(linkedTxId);
            if (linkedTx) {
                const linkedProps = linkedTx.getProps();
                const updatedLinked = Transaction.create({
                    ...linkedProps,
                    linkedTransactionId: undefined,
                    linkedAccountId: undefined,
                });
                (updatedLinked as any).id = linkedTxId;
                await trxTransactionRepo.update(updatedLinked);
            }
        }
    }

    // Stats methods
    async getAccountStats(accountId: string, startDate?: string, endDate?: string) {
        return this.transactionRepo.getAccountStats(accountId, startDate, endDate);
    }

    async getWorkspaceAccountStats(workspaceId: string, startDate?: string, endDate?: string) {
        return this.transactionRepo.getWorkspaceAccountStats(workspaceId, startDate, endDate);
    }

    async getWorkspaceStats(workspaceId: string, startDate?: string, endDate?: string) {
        return this.transactionRepo.getWorkspaceStats(workspaceId, startDate, endDate);
    }
}
