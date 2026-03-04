import { Request, Response } from 'express';
import { AccountService } from '../services/AccountService';
import { AccountValidators } from '../validators';
import { AppError } from '@shared/errors/AppError';
import { SubscriptionService } from '@domains/subscription/services/SubscriptionService';
import { Container } from '@di/Container';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { AccountRepository } from '../repositories/AccountRepository';
import { TransactionService } from '@domains/transactions/services/TransactionService';
import { TOKENS } from '@di/tokens';

export class AccountController {
    private subscriptionService: SubscriptionService;
    private accountRepo: AccountRepository;
    private transactionService: TransactionService;
    private db: DatabaseFacade;

    constructor(private accountService: AccountService) {
        this.db = Container.getInstance().resolve<DatabaseFacade>('Database');
        this.subscriptionService = Container.getInstance().resolve<SubscriptionService>('SubscriptionService');
        this.accountRepo = new AccountRepository(this.db);
        this.transactionService = Container.getInstance().resolve<TransactionService>(TOKENS.TransactionService);
    }

    private getWorkspaceId(req: Request): string {
        return req.params.workspaceId;
    }

    async getAccounts(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            // Membership & permission checked by middleware
            const accounts = await this.accountService.getAccountsByOrganization(workspaceId);
            res.json(accounts.map(a => a.toJSON()));
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getAccountById(req: Request, res: Response) {
        try {
            const { id } = AccountValidators.validateId(req.params);
            const workspaceId = this.getWorkspaceId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            // Membership & permission checked by middleware
            const account = await this.accountService.getAccountById(id, workspaceId);
            res.json(account.toJSON());
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async createAccount(req: Request, res: Response) {
        try {
            const data = AccountValidators.validateCreate(req.body);
            const workspaceId = this.getWorkspaceId(req);
            const userId = (req as any).user?.userId || (req as any).user?.id;

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            // Check subscription limits before creating
            const currentCount = await this.accountRepo.countByOrganizationId(workspaceId);
            await this.subscriptionService.checkFeatureLimit(userId, 'accounts', currentCount);

            // Store initial balance
            const initialBalance = data.balance;

            // Use database transaction for atomic operation
            const account = await this.db.transaction(async (trxDb) => {
                // Create account within transaction
                const trxAccountRepo = this.accountRepo.withDb(trxDb);
                const account = await this.accountService.createAccountWithRepo(data, userId, workspaceId, trxAccountRepo);

                // Create opening balance transaction if balance > 0
                if (initialBalance > 0) {
                    const trxTransactionService = new TransactionService(
                        new (await import('@domains/transactions/repositories/TransactionRepository')).TransactionRepository(trxDb),
                        this.accountRepo.withDb(trxDb),
                        trxDb
                    );
                    await trxTransactionService.createTransaction({
                        accountId: account.id,
                        type: 'income',
                        amount: initialBalance,
                        currency: data.currency,
                        description: 'Opening Balance',
                        date: new Date().toISOString(),
                    }, userId, workspaceId);
                }

                return account;
            });

            res.status(201).json(account.toJSON());
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async updateAccount(req: Request, res: Response) {
        try {
            const { id } = AccountValidators.validateId(req.params);
            const data = AccountValidators.validateUpdate(req.body);
            const workspaceId = this.getWorkspaceId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            // Permission checked by middleware
            const account = await this.accountService.updateAccount(id, data, workspaceId);
            res.json(account.toJSON());
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async deleteAccount(req: Request, res: Response) {
        try {
            const { id } = AccountValidators.validateId(req.params);
            const workspaceId = this.getWorkspaceId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            // Permission checked by middleware
            await this.accountService.deleteAccount(id, workspaceId);
            res.status(204).send();
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getTotalBalance(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            // Membership checked by middleware
            const result = await this.accountService.getTotalBalance(workspaceId);
            res.json(result);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }
}
