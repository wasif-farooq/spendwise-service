import { TransactionRepository } from '../repositories/TransactionRepository';
import { Transaction } from '../models/Transaction';
import { AppError } from '@shared/errors/AppError';

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
    categoryId?: string;
    linkedTransactionId?: string;
    linkedAccountId?: string;
    exchangeRate?: number;
}

export interface LinkTransactionDTO {
    linkedTransactionId: string;
    linkedAccountId: string;
}

export class TransactionService {
    constructor(private transactionRepo: TransactionRepository) { }

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

        const saved = await this.transactionRepo.save(transaction);

        // Invalidate stats cache
        this.transactionRepo.invalidateAccountStatsCache(data.accountId);

        // If linking to another transaction, update the linked transaction
        if (data.linkedTransactionId && data.linkedAccountId) {
            const linkedTx = await this.transactionRepo.findById(data.linkedTransactionId);
            if (linkedTx) {
                // Update the linked transaction to reference back
                const linkedProps = linkedTx.getProps();
                const updatedLinked = Transaction.create({
                    ...linkedProps,
                    linkedTransactionId: saved.id,
                    linkedAccountId: data.accountId,
                });
                (updatedLinked as any).id = linkedTx.id;
                await this.transactionRepo.update(updatedLinked);
                // Invalidate cache for linked account too
                this.transactionRepo.invalidateAccountStatsCache(data.linkedAccountId);
            }
        }

        return saved;
    }

    async updateTransaction(id: string, data: UpdateTransactionDTO, workspaceId: string): Promise<Transaction> {
        const existing = await this.transactionRepo.findById(id);
        if (!existing) {
            throw new AppError('Transaction not found', 404);
        }

        if (existing.workspaceId !== workspaceId) {
            throw new AppError('Transaction not found', 404);
        }

        const updatedProps = existing.getProps();
        const oldAccountId = existing.accountId;
        
        const updatedTransaction = Transaction.create({
            accountId: data.accountId || updatedProps.accountId,
            userId: updatedProps.userId,
            workspaceId: updatedProps.workspaceId,
            type: (data.type as 'income' | 'expense') || updatedProps.type,
            amount: data.amount ?? updatedProps.amount,
            currency: data.currency || updatedProps.currency,
            description: data.description ?? updatedProps.description,
            date: data.date ? new Date(data.date) : updatedProps.date,
            categoryId: data.categoryId ?? updatedProps.categoryId,
            linkedTransactionId: data.linkedTransactionId ?? updatedProps.linkedTransactionId,
            linkedAccountId: data.linkedAccountId ?? updatedProps.linkedAccountId,
            exchangeRate: data.exchangeRate ?? updatedProps.exchangeRate,
        });

        // Preserve the ID
        (updatedTransaction as any).id = id;
        
        const saved = await this.transactionRepo.update(updatedTransaction);

        // Invalidate cache for old and new account if account changed
        this.transactionRepo.invalidateAccountStatsCache(oldAccountId);
        if (data.accountId && data.accountId !== oldAccountId) {
            this.transactionRepo.invalidateAccountStatsCache(data.accountId);
        }

        return saved;
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
        const existing = await this.transactionRepo.findById(id);
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
            await this.unlinkTransaction(id, workspaceId);
        }

        await this.transactionRepo.delete(id);

        // Invalidate stats cache
        this.transactionRepo.invalidateAccountStatsCache(accountId);
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
