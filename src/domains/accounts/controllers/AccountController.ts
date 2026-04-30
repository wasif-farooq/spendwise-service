import { Request, Response } from 'express';
import { AccountRequestRepository } from '../repositories/AccountRequestRepository';
import { AccountValidators } from '../validators';
import { AppError } from '@shared/errors/AppError';
import { SubscriptionRequestRepository } from '@domains/subscription/repositories/SubscriptionRequestRepository';
import { UserPreferencesRequestRepository } from '@domains/users/repositories/UserPreferencesRequestRepository';
import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';

export class AccountController {
    constructor(
        private accountRequestRepository: AccountRequestRepository,
        private subscriptionRequestRepository?: SubscriptionRequestRepository,
        private userPreferencesRequestRepository?: UserPreferencesRequestRepository,
        private workspaceRequestRepository?: WorkspaceRequestRepository
    ) { }

    private getWorkspaceId(req: Request): string {
        return req.params.workspaceId;
    }

    private getUserId(req: Request): string {
        return (req as any).user?.userId || (req as any).user?.id || (req as any).user?.sub;
    }

    async getAccounts(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const result = await this.accountRequestRepository.getAccounts(workspaceId, userId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.json(result.data?.map((a: any) => a.toJSON ? a.toJSON() : a) || []);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getAccountById(req: Request, res: Response) {
        try {
            const { id } = AccountValidators.validateId(req.params);
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const result = await this.accountRequestRepository.getAccountById(workspaceId, id, userId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            const account = result.data;
            res.json(account?.toJSON ? account.toJSON() : account);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async createAccount(req: Request, res: Response) {
        try {
            const data = AccountValidators.validateCreate(req.body);
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            if (this.subscriptionRequestRepository) {
                const countResult = await this.accountRequestRepository.countByWorkspace(workspaceId);
                const currentCount = countResult.data?.count || 0;

                let ownerId = userId;
                if (this.workspaceRequestRepository) {
                    const workspaceResult = await this.workspaceRequestRepository.getById(workspaceId, userId);
                    if (!workspaceResult.error && workspaceResult.data) {
                        ownerId = workspaceResult.data.ownerId;
                    }
                }

                await this.subscriptionRequestRepository.checkFeatureLimit(ownerId, 'accounts', currentCount);
            }

            const result = await this.accountRequestRepository.createWithOpeningBalance(workspaceId, userId, data);

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.status(201).json(result.data?.toJSON ? result.data.toJSON() : result.data);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async updateAccount(req: Request, res: Response) {
        try {
            const { id } = AccountValidators.validateId(req.params);
            const data = AccountValidators.validateUpdate(req.body);
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const result = await this.accountRequestRepository.update(workspaceId, id, userId, data);

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.json(result.data?.toJSON ? result.data.toJSON() : result.data);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async deleteAccount(req: Request, res: Response) {
        try {
            const { id } = AccountValidators.validateId(req.params);
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            const result = await this.accountRequestRepository.delete(workspaceId, id, userId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.status(204).send();
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getTotalBalance(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            let targetCurrency = 'USD';
            if (this.userPreferencesRequestRepository) {
                const prefsResult = await this.userPreferencesRequestRepository.getPreferences(userId);
                if (prefsResult.data) {
                    targetCurrency = prefsResult.data.currency || 'USD';
                }
            }

            const result = await this.accountRequestRepository.getTotalBalance(workspaceId, targetCurrency, userId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode);
            }

            res.json(result.data);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }
}