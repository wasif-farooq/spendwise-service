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

    async getAccountsByOrganization(organizationId: string): Promise<Account[]> {
        return this.accountRepository.findByOrganizationId(organizationId);
    }

    async getAccountsByUser(userId: string): Promise<Account[]> {
        return this.accountRepository.findByUserId(userId);
    }

    async getAccountById(id: string, organizationId: string): Promise<Account> {
        const account = await this.accountRepository.findById(id);
        if (!account) {
            throw new AppError('Account not found', 404);
        }
        // Verify the account belongs to the organization
        if (account.organizationId !== organizationId) {
            throw new AppError('Account not found', 404);
        }
        return account;
    }

    async createAccount(data: CreateAccountDto, userId: string, organizationId: string): Promise<Account> {
        const account = Account.create({
            ...data,
            userId,
            organizationId,
        });
        return this.accountRepository.save(account);
    }

    async updateAccount(id: string, data: UpdateAccountDto, organizationId: string): Promise<Account> {
        const account = await this.getAccountById(id, organizationId);
        
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

    async deleteAccount(id: string, organizationId: string): Promise<void> {
        await this.getAccountById(id, organizationId); // Verify ownership
        await this.accountRepository.delete(id);
    }

    async getTotalBalance(organizationId: string): Promise<{ total: number }> {
        const total = await this.accountRepository.getTotalBalance(organizationId);
        return { total };
    }
}
