import { TransactionRepository } from '../repositories/TransactionRepository';
import { Transaction } from '../models/Transaction';
import { AppError } from '@shared/errors/AppError';

export interface CreateTransactionDTO {
    accountId: string;
    type: 'income' | 'expense' | 'transfer';
    amount: number;
    currency: string;
    description?: string;
    date: string;
    categoryId?: string;
    // For transfer
    toAccountId?: string;
    exchangeRate?: number;
}

export interface UpdateTransactionDTO {
    accountId?: string;
    type?: 'income' | 'expense' | 'transfer';
    amount?: number;
    currency?: string;
    description?: string;
    date?: string;
    categoryId?: string;
    toAccountId?: string;
    exchangeRate?: number;
}

export class TransactionService {
    constructor(private transactionRepo: TransactionRepository) { }

    async getTransactionsByWorkspace(workspaceId: string, options: {
        limit?: number;
        offset?: number;
        search?: string;
        accountId?: string;
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
            toAccountId: data.toAccountId,
            exchangeRate: data.exchangeRate,
        });

        return this.transactionRepo.save(transaction);
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
        
        const updatedTransaction = Transaction.create({
            accountId: data.accountId || updatedProps.accountId,
            userId: updatedProps.userId,
            workspaceId: updatedProps.workspaceId,
            type: (data.type as 'income' | 'expense' | 'transfer') || updatedProps.type,
            amount: data.amount ?? updatedProps.amount,
            currency: data.currency || updatedProps.currency,
            description: data.description ?? updatedProps.description,
            date: data.date ? new Date(data.date) : updatedProps.date,
            categoryId: data.categoryId ?? updatedProps.categoryId,
            toAccountId: data.toAccountId ?? updatedProps.toAccountId,
            exchangeRate: data.exchangeRate ?? updatedProps.exchangeRate,
        });

        // Preserve the ID
        (updatedTransaction as any).id = id;
        
        return this.transactionRepo.update(updatedTransaction);
    }

    async deleteTransaction(id: string, workspaceId: string): Promise<void> {
        const existing = await this.transactionRepo.findById(id);
        if (!existing) {
            throw new AppError('Transaction not found', 404);
        }

        if (existing.workspaceId !== workspaceId) {
            throw new AppError('Transaction not found', 404);
        }

        return this.transactionRepo.delete(id);
    }
}
