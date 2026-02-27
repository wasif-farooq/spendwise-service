import { Request, Response } from 'express';
import { TransactionService, CreateTransactionDTO, UpdateTransactionDTO, LinkTransactionDTO } from '../services/TransactionService';
import { AppError } from '@shared/errors/AppError';
import { SubscriptionService } from '@domains/subscription/services/SubscriptionService';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { Container } from '@di/Container';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { WorkspaceMembersRepository } from '@domains/workspaces/repositories/WorkspaceMembersRepository';

export class TransactionController {
    private subscriptionService: SubscriptionService;
    private transactionRepo: TransactionRepository;
    private membersRepo: WorkspaceMembersRepository;

    constructor(private transactionService: TransactionService) {
        const db = Container.getInstance().resolve<DatabaseFacade>('Database');
        this.subscriptionService = Container.getInstance().resolve<SubscriptionService>('SubscriptionService');
        this.transactionRepo = new TransactionRepository(db);
        this.membersRepo = new WorkspaceMembersRepository(db);
    }

    private getWorkspaceId(req: Request): string {
        return req.params.workspaceId;
    }

    async getTransactions(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const { page, limit, search, accountId, categoryId, startDate, endDate } = req.query;

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const result = await this.transactionService.getTransactionsByWorkspace(workspaceId, {
                limit: limit ? parseInt(limit as string) : undefined,
                offset: page ? (parseInt(page as string) - 1) * (parseInt(limit as string) || 50) : undefined,
                search: search as string,
                accountId: accountId as string,
                categoryId: categoryId as string,
                startDate: startDate as string,
                endDate: endDate as string,
            });

            res.json(result);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getTransactionById(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const workspaceId = this.getWorkspaceId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const transaction = await this.transactionService.getTransactionById(id);
            if (!transaction || transaction.workspaceId !== workspaceId) {
                throw new AppError('Transaction not found', 404);
            }

            res.json(transaction.toJSON());
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async createTransaction(req: Request, res: Response) {
        try {
            const data: CreateTransactionDTO = req.body;
            const workspaceId = this.getWorkspaceId(req);
            const userId = (req as any).user?.userId || (req as any).user?.id;

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            // Validate type is not transfer (disabled)
            if ((data.type as string) === 'transfer') {
                throw new AppError('Transfer type is disabled. Use linked transactions instead.', 400);
            }

            // Check subscription limits for this account this month
            const currentMonthCount = await this.transactionRepo.countByAccountThisMonth(data.accountId);
            await this.subscriptionService.checkAccountTransactionLimit(userId, data.accountId, currentMonthCount);

            const transaction = await this.transactionService.createTransaction(data, userId, workspaceId);
            res.status(201).json(transaction.toJSON());
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async updateTransaction(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const data: UpdateTransactionDTO = req.body;
            const workspaceId = this.getWorkspaceId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            // Validate type is not transfer (disabled)
            if ((data.type as string) === 'transfer') {
                throw new AppError('Transfer type is disabled. Use linked transactions instead.', 400);
            }

            const transaction = await this.transactionService.updateTransaction(id, data, workspaceId);
            res.json(transaction.toJSON());
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async deleteTransaction(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const workspaceId = this.getWorkspaceId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            await this.transactionService.deleteTransaction(id, workspaceId);
            res.status(204).send();
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    // Link transaction to another transaction
    async linkTransaction(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const data: LinkTransactionDTO = req.body;
            const workspaceId = this.getWorkspaceId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const transaction = await this.transactionService.linkTransaction(id, data, workspaceId);
            res.json(transaction.toJSON());
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    // Unlink transaction
    async unlinkTransaction(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const workspaceId = this.getWorkspaceId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const transaction = await this.transactionService.unlinkTransaction(id, workspaceId);
            res.json(transaction.toJSON());
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    // Get account stats
    async getAccountStats(req: Request, res: Response) {
        try {
            const { accountId } = req.params;
            const { startDate, endDate } = req.query;

            const stats = await this.transactionService.getAccountStats(
                accountId,
                startDate as string,
                endDate as string
            );

            res.json(stats);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    // Get all accounts stats for workspace
    async getWorkspaceAccountStats(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const { startDate, endDate } = req.query;

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const stats = await this.transactionService.getWorkspaceAccountStats(
                workspaceId,
                startDate as string,
                endDate as string
            );

            res.json({ accounts: stats });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    // Get workspace-wide stats
    async getWorkspaceStats(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const { startDate, endDate } = req.query;

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const stats = await this.transactionService.getWorkspaceStats(
                workspaceId,
                startDate as string,
                endDate as string
            );

            res.json(stats);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }
}
