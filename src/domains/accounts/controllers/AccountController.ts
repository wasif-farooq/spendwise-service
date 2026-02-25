import { Request, Response } from 'express';
import { AccountService } from '../services/AccountService';
import { AccountValidators } from '../validators';
import { AppError } from '@shared/errors/AppError';
import { WorkspaceMembersRepository } from '@domains/workspaces/repositories/WorkspaceMembersRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

export class AccountController {
    private membersRepo: WorkspaceMembersRepository;

    constructor(private accountService: AccountService) {
        // Get database from container
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        this.membersRepo = new WorkspaceMembersRepository(db);
    }

    private getWorkspaceId(req: Request): string {
        return req.params.workspaceId || req.params.orgId;
    }

    private getUserId(req: Request): string {
        return (req as any).user?.userId || (req as any).user?.id;
    }

    private async checkMembership(workspaceId: string, userId: string): Promise<void> {
        const member = await this.membersRepo.findByUserAndWorkspace(userId, workspaceId);
        if (!member) {
            throw new AppError('You are not a member of this workspace', 403);
        }
    }

    async getAccounts(req: Request, res: Response) {
        try {
            const workspaceId = this.getWorkspaceId(req);
            const userId = this.getUserId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            // Verify user is a member
            await this.checkMembership(workspaceId, userId);

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
            const userId = this.getUserId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            // Verify user is a member
            await this.checkMembership(workspaceId, userId);

            const account = await this.accountService.getAccountById(id, workspaceId);
            res.json(account.toJSON());
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async createAccount(req: Request, res: Response) {
        try {
            const data = AccountValidators.validateCreate(req.body);
            const userId = this.getUserId(req);
            const workspaceId = this.getWorkspaceId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            // Verify user is a member
            await this.checkMembership(workspaceId, userId);

            const account = await this.accountService.createAccount(data, userId, workspaceId);
            res.status(201).json(account.toJSON());
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async updateAccount(req: Request, res: Response) {
        try {
            const { id } = AccountValidators.validateId(req.params);
            const data = AccountValidators.validateUpdate(req.body);
            const userId = this.getUserId(req);
            const workspaceId = this.getWorkspaceId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            // Verify user is a member
            await this.checkMembership(workspaceId, userId);

            const account = await this.accountService.updateAccount(id, data, workspaceId);
            res.json(account.toJSON());
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async deleteAccount(req: Request, res: Response) {
        try {
            const { id } = AccountValidators.validateId(req.params);
            const userId = this.getUserId(req);
            const workspaceId = this.getWorkspaceId(req);

            if (!workspaceId) {
                throw new AppError('Workspace not found', 404);
            }

            // Verify user is a member
            await this.checkMembership(workspaceId, userId);

            await this.accountService.deleteAccount(id, workspaceId);
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

            // Verify user is a member
            await this.checkMembership(workspaceId, userId);

            const result = await this.accountService.getTotalBalance(workspaceId);
            res.json(result);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }
}
