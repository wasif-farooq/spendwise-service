import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';
import { IAccountRepository } from '../repositories/IAccountRepository';
import { Account, AccountType } from '../models/Account';
import { AppError } from '@shared/errors/AppError';
import { CreateAccountDto, UpdateAccountDto } from '../dto';
import { ExchangeRateService } from '@domains/exchange-rates/services/ExchangeRateService';

export class AccountService {
    constructor(
        @Inject('AccountRepository') private accountRepository: IAccountRepository,
        @Inject('ExchangeRateService') private exchangeRateService?: ExchangeRateService
    ) { }

    async getAccountsByWorkspace(workspaceId: string): Promise<Account[]> {
        return this.accountRepository.findByWorkspaceId(workspaceId);
    }

    async getAccountsByUser(userId: string): Promise<Account[]> {
        return this.accountRepository.findByUserId(userId);
    }

    async getAccountById(id: string, workspaceId: string): Promise<Account> {
        const account = await this.accountRepository.findById(id);
        if (!account) {
            throw new AppError('Account not found', 404);
        }
        // Verify the account belongs to the workspace
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

    async getTotalBalance(workspaceIdId: string, targetCurrency: string): Promise<{ total: number; currency: string }> {
        const accounts = await this.accountRepository.findAllWithBalancesForWorkspace(workspaceIdId);
        
        let total = 0;
        for (const account of accounts) {
            if (account.currency === targetCurrency) {
                total += account.balance;
            } else if (this.exchangeRateService) {
                try {
                    const conversion = await this.exchangeRateService.convert(
                        account.balance,
                        account.currency,
                        targetCurrency
                    );
                    total += conversion.convertedAmount;
                } catch (err) {
                    console.error(`[AccountService] Failed to convert ${account.currency} to ${targetCurrency}:`, err);
                    total += account.balance;
                }
            } else {
                total += account.balance;
            }
        }
        
        return { total: Math.round(total * 100) / 100, currency: targetCurrency };
    }
}
