import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';
import { IAccountRepository } from '../repositories/IAccountRepository';
import { Account, AccountType } from '../models/Account';
import { AppError } from '@shared/errors/AppError';
import { CreateAccountDto, UpdateAccountDto } from '../dto';

export class AccountService {
    constructor(
        @Inject('AccountRepository') private accountRepository: IAccountRepository
    ) { }

    async getAccountsByOrganization(workspaceId: string): Promise<Account[]> {
        return this.accountRepository.findByOrganizationId(workspaceId);
    }

    async getAccountsByUser(userId: string): Promise<Account[]> {
        return this.accountRepository.findByUserId(userId);
    }

    async getAccountById(id: string, workspaceId: string): Promise<Account> {
        const account = await this.accountRepository.findById(id);
        if (!account) {
            throw new AppError('Account not found', 404);
        }
        // Verify the account belongs to the organization
        if (account.workspaceId !== workspaceId) {
            throw new AppError('Account not found', 404);
        }
        return account;
    }

    async createAccount(data: CreateAccountDto, userId: string, workspaceId: string): Promise<Account> {
        const account = Account.create({
            ...data,
            userId,
            workspaceId,
        });
        return this.accountRepository.save(account);
    }

    async createAccountWithRepo(data: CreateAccountDto, userId: string, workspaceId: string, repo: any): Promise<Account> {
        const account = Account.create({
            ...data,
            userId,
            workspaceId,
        });
        return repo.save(account);
    }

    async updateAccount(id: string, data: UpdateAccountDto, workspaceId: string): Promise<Account> {
        const account = await this.getAccountById(id, workspaceId);
        
        if (data.name !== undefined) {
            account.updateDetails(data.name, account.color);
        }
        if (data.balance !== undefined) {
            account.updateBalance(data.balance);
        }
        if (data.color !== undefined) {
            account.updateDetails(account.name, data.color);
        }
        
        return this.accountRepository.update(account);
    }

    async deleteAccount(id: string, workspaceId: string): Promise<void> {
        await this.getAccountById(id, workspaceId); // Verify ownership
        await this.accountRepository.delete(id);
    }

    async getTotalBalance(workspaceId: string): Promise<{ total: number }> {
        const total = await this.accountRepository.getTotalBalance(workspaceId);
        return { total };
    }
}
