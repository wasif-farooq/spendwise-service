import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { ServiceFactory } from '@factories/ServiceFactory';
import { AccountService } from '../services/AccountService';
import { CreateAccountDto, UpdateAccountDto } from '../dto';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

export class AccountRequestRepository {
    private config = ConfigLoader.getInstance();

    private getMode(): string {
        return this.config.get('repository.mode') || 'direct';
    }

    private getService(): AccountService {
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const repoFactory = new RepositoryFactory(db);
        const serviceFactory = new ServiceFactory(repoFactory, db);
        return serviceFactory.createAccountService();
    }

    private wrap(promise: Promise<any>): Promise<any> {
        return promise
            .then(data => ({ data, error: null, statusCode: 200 }))
            .catch(error => ({
                error: error.message || 'An error occurred',
                statusCode: error.statusCode || 500,
                data: null
            }));
    }

    async getAccounts(workspaceId: string, _userId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.getAccountsByWorkspace(workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async getAccountById(workspaceId: string, accountId: string, _userId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.getAccountById(accountId, workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async getTotalBalance(workspaceId: string, targetCurrency: string, _userId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.getTotalBalance(workspaceId, targetCurrency));
        }
        throw new Error('RPC mode not implemented');
    }

    async countByWorkspace(workspaceId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            const accounts = await service.getAccountsByWorkspace(workspaceId);
            return this.wrap(Promise.resolve({ count: accounts.length }));
        }
        throw new Error('RPC mode not implemented');
    }

    async create(workspaceId: string, userId: string, data: CreateAccountDto) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.createAccount(data, userId, workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async createWithOpeningBalance(workspaceId: string, userId: string, data: CreateAccountDto) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
            const repoFactory = new RepositoryFactory(db);
            const accountRepo = repoFactory.createAccountRepository();

            const initialBalance = data.balance || 0;

            const account = await db.transaction(async (trxDb) => {
                const trxAccountRepo = accountRepo.withDb(trxDb);
                const created = await service.createAccountWithRepo(data, userId, workspaceId, trxAccountRepo);

                if (initialBalance > 0) {
                    const { TransactionService } = require('@domains/transactions/services/TransactionService');
                    const { TransactionRepository } = require('@domains/transactions/repositories/TransactionRepository');
                    const trxTransactionRepo = new TransactionRepository(trxDb);
                    const trxTransactionService = new TransactionService(
                        trxTransactionRepo,
                        trxAccountRepo,
                        trxDb
                    );
                    await trxTransactionService.createTransaction({
                        accountId: created.id,
                        type: 'income',
                        amount: initialBalance,
                        currency: data.currency,
                        description: 'Opening Balance',
                        date: new Date().toISOString(),
                    }, userId, workspaceId);
                }

                return created;
            });

            return this.wrap(Promise.resolve(account));
        }
        throw new Error('RPC mode not implemented');
    }

    async update(workspaceId: string, accountId: string, _userId: string, data: UpdateAccountDto) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.updateAccount(accountId, data, workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async delete(workspaceId: string, accountId: string, _userId: string) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.deleteAccount(accountId, workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }
}