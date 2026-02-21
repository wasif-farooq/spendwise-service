import { Request, Response } from 'express';
import { AccountService } from '../services/AccountService';
import { AccountValidators } from '../validators';
import { AppError } from '@shared/errors/AppError';
import { OrganizationMembersRepository } from '@domains/organizations/repositories/OrganizationMembersRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

export class AccountController {
    private membersRepo: OrganizationMembersRepository;

    constructor(private accountService: AccountService) {
        // Get database from container
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        this.membersRepo = new OrganizationMembersRepository(db);
    }

    private getOrganizationId(req: Request): string {
        return req.params.orgId;
    }

    private getUserId(req: Request): string {
        return (req as any).user?.userId || (req as any).user?.id;
    }

    private async checkMembership(orgId: string, userId: string): Promise<void> {
        const member = await this.membersRepo.findByUserAndOrg(userId, orgId);
        if (!member) {
            throw new AppError('You are not a member of this organization', 403);
        }
    }

    async getAccounts(req: Request, res: Response) {
        try {
            const organizationId = this.getOrganizationId(req);
            const userId = this.getUserId(req);

            if (!organizationId) {
                throw new AppError('Organization not found', 404);
            }

            // Verify user is a member
            await this.checkMembership(organizationId, userId);

            const accounts = await this.accountService.getAccountsByOrganization(organizationId);
            res.json(accounts.map(a => a.toJSON()));
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getAccountById(req: Request, res: Response) {
        try {
            const { id } = AccountValidators.validateId(req.params);
            const organizationId = this.getOrganizationId(req);
            const userId = this.getUserId(req);

            if (!organizationId) {
                throw new AppError('Organization not found', 404);
            }

            // Verify user is a member
            await this.checkMembership(organizationId, userId);

            const account = await this.accountService.getAccountById(id, organizationId);
            res.json(account.toJSON());
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async createAccount(req: Request, res: Response) {
        try {
            const data = AccountValidators.validateCreate(req.body);
            const userId = this.getUserId(req);
            const organizationId = this.getOrganizationId(req);

            if (!organizationId) {
                throw new AppError('Organization not found', 404);
            }

            // Verify user is a member
            await this.checkMembership(organizationId, userId);

            const account = await this.accountService.createAccount(data, userId, organizationId);
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
            const organizationId = this.getOrganizationId(req);

            if (!organizationId) {
                throw new AppError('Organization not found', 404);
            }

            // Verify user is a member
            await this.checkMembership(organizationId, userId);

            const account = await this.accountService.updateAccount(id, data, organizationId);
            res.json(account.toJSON());
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async deleteAccount(req: Request, res: Response) {
        try {
            const { id } = AccountValidators.validateId(req.params);
            const userId = this.getUserId(req);
            const organizationId = this.getOrganizationId(req);

            if (!organizationId) {
                throw new AppError('Organization not found', 404);
            }

            // Verify user is a member
            await this.checkMembership(organizationId, userId);

            await this.accountService.deleteAccount(id, organizationId);
            res.status(204).send();
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    async getTotalBalance(req: Request, res: Response) {
        try {
            const organizationId = this.getOrganizationId(req);
            const userId = this.getUserId(req);

            if (!organizationId) {
                throw new AppError('Organization not found', 404);
            }

            // Verify user is a member
            await this.checkMembership(organizationId, userId);

            const result = await this.accountService.getTotalBalance(organizationId);
            res.json(result);
        } catch (error: any) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }
}
