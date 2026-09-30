import { Inject } from '@di/decorators/inject.decorator';
import { IAccountRepository } from '../repositories/IAccountRepository';
import { Account } from '../models/Account';
import { AppError } from '@shared/errors/AppError';
import { CreateAccountDto, UpdateAccountDto } from '../dto';
import { ExchangeRateService } from '@domains/exchange-rates/services/ExchangeRateService';
import { ActivityCaptureService } from '@shared/ActivityCaptureService';
import { roundAmount } from '@domains/currencies/currencies';
import { TotalsConverter } from '@domains/currencies/TotalsConverter';

export class AccountService {
  constructor(
    @Inject('AccountRepository') private accountRepository: IAccountRepository,
    @Inject('ExchangeRateService') private exchangeRateService?: ExchangeRateService,
    private activityCapture?: ActivityCaptureService,
  ) {}

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

  async createAccount(
    data: CreateAccountDto,
    userId: string,
    workspaceId: string,
  ): Promise<Account> {
    const account = Account.create({
      ...data,
      userId,
      workspaceId,
    });
    const saved = await this.accountRepository.save(account);

    if (this.activityCapture) {
      this.activityCapture
        .log(
          {
            entityType: 'account',
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
  }

  async createAccountWithRepo(
    data: CreateAccountDto,
    userId: string,
    workspaceId: string,
    repo: any,
  ): Promise<Account> {
    const account = Account.create({
      ...data,
      userId,
      workspaceId,
    });
    return repo.save(account);
  }

  async updateAccount(
    id: string,
    data: UpdateAccountDto,
    workspaceId: string,
    userId?: string,
  ): Promise<Account> {
    console.log('[DEBUG AccountService] updateAccount called with data:', data);
    const account = await this.getAccountById(id, workspaceId);
    const oldValues = account.toJSON();

    if (data.name !== undefined) {
      console.log('[DEBUG] Updating name to:', data.name);
      account.updateDetails(data.name, account.color);
    }
    if (data.balance !== undefined) {
      account.updateBalance(data.balance);
    }
    if (data.color !== undefined) {
      account.updateDetails(account.name, data.color);
    }
    if (data.type !== undefined) {
      console.log('[DEBUG] Updating type to:', data.type);
      account.updateType(data.type);
    }
    if (data.currency !== undefined) {
      if (account.currency !== data.currency && account.hasTransactions()) {
        throw new AppError('Cannot change currency for account with existing transactions', 400);
      }
      console.log('[DEBUG] Updating currency to:', data.currency);
      account.updateCurrency(data.currency);
    }

    const updated = await this.accountRepository.update(account);
    console.log('[DEBUG] Repository returned:', updated.toJSON());

    if (this.activityCapture) {
      this.activityCapture
        .log(
          {
            entityType: 'account',
            entityId: id,
            action: 'update',
            oldValues,
            newValues: updated.toJSON(),
          },
          {
            workspaceId,
            userId: userId || account.userId,
          },
        )
        .catch(() => {});
    }

    return updated;
  }

  async deleteAccount(id: string, workspaceId: string, userId?: string): Promise<void> {
    const account = await this.getAccountById(id, workspaceId);
    const oldValues = account.toJSON();
    await this.accountRepository.delete(id);

    if (this.activityCapture) {
      this.activityCapture
        .log(
          {
            entityType: 'account',
            entityId: id,
            action: 'delete',
            oldValues,
          },
          {
            workspaceId,
            userId: userId || account.userId,
          },
        )
        .catch(() => {});
    }
  }

  /**
   * Sum of every account's balance in `targetCurrency`. Accounts whose
   * currency has no rate are left out and listed in `unconvertedCurrencies`
   * (they used to be added unconverted, so 1 BTC counted as 1 USD).
   */
  async getTotalBalance(
    workspaceIdId: string,
    targetCurrency: string,
  ): Promise<{ total: number; currency: string; unconvertedCurrencies: string[] }> {
    const balances = await this.accountRepository.getBalancesByCurrency(workspaceIdId);
    const service = this.exchangeRateService;
    const converter = new TotalsConverter(
      targetCurrency,
      service ? async (from, to) => (await service.convert(1, from, to)).rate : undefined,
    );

    let total = 0;
    for (const { currency, total: sum } of balances) {
      const converted = await converter.convert(sum, currency);
      if (converted !== null) total += converted;
    }

    return {
      total: roundAmount(total, targetCurrency),
      currency: targetCurrency,
      unconvertedCurrencies: converter.unconvertedCurrencies(),
    };
  }
}
