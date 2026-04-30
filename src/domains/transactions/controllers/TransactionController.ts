import { Request, Response } from 'express';
import { TransactionRequestRepository } from '../repositories/TransactionRequestRepository';
import { SubscriptionRequestRepository } from '@domains/subscription/repositories/SubscriptionRequestRepository';
import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';
import { AppError } from '@shared/errors/AppError';
import { CreateTransactionDTO, UpdateTransactionDTO, TransferDTO } from '../services/TransactionService';

export class TransactionController {
    constructor(
        private transactionRequestRepository: TransactionRequestRepository,
        private subscriptionRequestRepository?: SubscriptionRequestRepository,
        private workspaceRequestRepository?: WorkspaceRequestRepository
    ) { }

    private getWorkspaceId(req: Request): string {
        return req.params.workspaceId;
    }

    private getUserId(req: Request): string {
        return (req as any).user?.userId || (req as any).user?.id || (req as any).user?.sub;
    }

    async getTransactions(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const accountIdFromParams = req.params.accountId;

            const {
                cursor,
                page,
                limit: limitStr,
                search,
                categoryId,
                category,
                type,
                startDate,
                endDate
            } = req.query;

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const userId = this.getUserId(req);

            if (startDate && this.subscriptionRequestRepository) {
                let ownerId = userId;
                if (this.workspaceRequestRepository) {
                    const workspaceResult = await this.workspaceRequestRepository.getById(workspaceId, userId);
                    if (!workspaceResult.error && workspaceResult.data) {
                        ownerId = workspaceResult.data.ownerId;
                    }
                }
                await this.subscriptionRequestRepository.checkTransactionHistoryLimit(ownerId, startDate as string);
            }

            const useCursorPagination = cursor !== undefined || page === undefined;
            const accountId = accountIdFromParams || (req.query.accountId as string);
            const limit = Math.min(parseInt(limitStr as string) || 50, 100);

            if (useCursorPagination && accountId) {
                const result = await this.transactionRequestRepository.getTransactionsByAccountCursor(
                    accountId,
                    { limit, cursor: cursor as string },
                    {
                        type: type as any,
                        categoryId: categoryId as string,
                        startDate: startDate as string,
                        endDate: endDate as string,
                        search: search as string,
                    }
                );

                if (result.error) {
                    throw new AppError(result.error, result.statusCode);
                }

                return res.json({
                    transactions: result.data?.data,
                    pagination: result.data?.pagination,
                });
            }

            if (useCursorPagination) {
                const result = await this.transactionRequestRepository.getTransactionsByWorkspaceCursor(
                    workspaceId,
                    { limit, cursor: cursor as string },
                    {
                        accountId: accountId,
                        categoryId: categoryId as string,
                        category: category as string,
                        type: type as string,
                        startDate: startDate as string,
                        endDate: endDate as string,
                        search: search as string,
                    }
                );

                if (result.error) {
                    throw new AppError(result.error, result.statusCode);
                }

                return res.json({
                    transactions: result.data?.data,
                    pagination: result.data?.pagination,
                });
            }

            const result = await this.transactionRequestRepository.getTransactionsByWorkspace(workspaceId, {
                limit,
                offset: page ? (parseInt(page as string) - 1) * limit : 0,
                search: search as string,
                accountId: accountId,
                categoryId: categoryId as string,
                type: type as string,
                startDate: startDate as string,
                endDate: endDate as string,
            });

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.json(result.data);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getAllTransactions(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const { cursor, limit = 50, offset = 0, search, type, categoryId, startDate, endDate } = req.query;

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            if (cursor || (offset === 0 && search === undefined)) {
                const result = await this.transactionRequestRepository.getTransactionsByWorkspaceCursor(
                    workspaceId,
                    { limit: parseInt(limit as string), cursor: cursor as string },
                    {
                        search: search as string,
                        type: type as string,
                        categoryId: categoryId as string,
                        startDate: startDate as string,
                        endDate: endDate as string,
                    }
                );

                if (result.error) {
                    throw new AppError(result.error, result.statusCode);
                }

                return res.json({
                    transactions: result.data?.data,
                    pagination: result.data?.pagination,
                });
            }

            const result = await this.transactionRequestRepository.getTransactionsByWorkspace(workspaceId, {
                limit: parseInt(limit as string),
                offset: parseInt(offset as string),
                search: search as string,
                type: type as string,
                categoryId: categoryId as string,
                startDate: startDate as string,
                endDate: endDate as string,
            });

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.json(result.data);
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

            const result = await this.transactionRequestRepository.getTransactionWithDetails(id, workspaceId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.json(result.data);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async createTransaction(req: Request, res: Response) {
        try {
            const data: CreateTransactionDTO = req.body;
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            if ((data.type as string) === 'transfer') {
                throw new AppError('Transfer type is disabled. Use linked transactions instead.', 400);
            }

            if (this.subscriptionRequestRepository) {
                const currentMonthCount = await this.transactionRequestRepository.countByAccountThisMonth(data.accountId);

                let ownerId = userId;
                if (this.workspaceRequestRepository) {
                    const workspaceResult = await this.workspaceRequestRepository.getById(workspaceId, userId);
                    if (!workspaceResult.error && workspaceResult.data) {
                        ownerId = workspaceResult.data.ownerId;
                    }
                }

                await this.subscriptionRequestRepository.checkAccountTransactionLimit(ownerId, data.accountId, currentMonthCount);
            }

            const result = await this.transactionRequestRepository.create(workspaceId, userId, data);

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.status(201).json(result.data?.toJSON ? result.data.toJSON() : result.data);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async updateTransaction(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const data: UpdateTransactionDTO = req.body;
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            if ((data.type as string) === 'transfer') {
                throw new AppError('Transfer type is disabled. Use linked transactions instead.', 400);
            }

            const result = await this.transactionRequestRepository.update(workspaceId, id, userId, data);

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.json(result.data?.toJSON ? result.data.toJSON() : result.data);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async deleteTransaction(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const result = await this.transactionRequestRepository.delete(workspaceId, id, userId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.status(204).send();
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async linkTransaction(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const data = req.body;
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const result = await this.transactionRequestRepository.link(workspaceId, id, userId, data);

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.json(result.data?.toJSON ? result.data.toJSON() : result.data);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async unlinkTransaction(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const dto = { linkedId: req.body.linkedId };
            const result = await this.transactionRequestRepository.unlink(workspaceId, id, userId, dto);

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.json(result.data?.toJSON ? result.data.toJSON() : result.data);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getAccountStats(req: Request, res: Response) {
        try {
            const { accountId } = req.params;
            const { startDate, endDate } = req.query;
            const userId = this.getUserId(req);

            const result = await this.transactionRequestRepository.getTransactionStats(
                accountId,
                startDate as string,
                endDate as string
            );

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.json(result.data);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getWorkspaceAccountStats(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const { startDate, endDate } = req.query;

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const result = await this.transactionRequestRepository.getWorkspaceAccountStats(
                workspaceId,
                startDate as string,
                endDate as string
            );

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.json({ accounts: result.data });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getWorkspaceStats(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const { startDate, endDate } = req.query;

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const result = await this.transactionRequestRepository.getWorkspaceStats(
                workspaceId,
                startDate as string,
                endDate as string
            );

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.json(result.data);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async transfer(req: Request, res: Response) {
        try {
            const data: TransferDTO = req.body;
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const result = await this.transactionRequestRepository.transfer(workspaceId, userId, data);

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.status(201).json({
                withdraw: result.data?.withdraw?.toJSON ? result.data.withdraw.toJSON() : result.data?.withdraw,
                deposit: result.data?.deposit?.toJSON ? result.data.deposit.toJSON() : result.data?.deposit,
            });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }
}