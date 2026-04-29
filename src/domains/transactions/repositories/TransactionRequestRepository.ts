import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { ServiceFactory } from '@factories/ServiceFactory';
import { TransactionService, CreateTransactionDTO, UpdateTransactionDTO, TransferDTO } from '../services/TransactionService';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

export class TransactionRequestRepository {
    private config = ConfigLoader.getInstance();
    private cachedService: TransactionService | null = null;
    private servicePromise: Promise<TransactionService> | null = null;

    private getMode(): string {
        return this.config.get('repository.mode') || 'direct';
    }

    private async getService(): Promise<TransactionService> {
        if (this.cachedService) {
            return this.cachedService;
        }

        if (this.servicePromise) {
            return this.servicePromise;
        }

        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const repoFactory = new RepositoryFactory(db);
        const serviceFactory = new ServiceFactory(repoFactory, db);

        this.servicePromise = serviceFactory.createTransactionService().then((service: TransactionService) => {
            this.cachedService = service;
            this.servicePromise = null;
            return service;
        });

        return this.servicePromise;
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

    async getTransactionsByAccountCursor(accountId: string, pagination: { limit: number; cursor?: string }, filters?: any) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.getTransactionsByAccountCursor(accountId, pagination, filters));
        }
        throw new Error('RPC mode not implemented');
    }

    async getTransactionsByWorkspaceCursor(workspaceId: string, pagination: { limit: number; cursor?: string }, filters?: any) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.getTransactionsByWorkspaceCursor(workspaceId, pagination, filters));
        }
        throw new Error('RPC mode not implemented');
    }

    async getTransactionsByWorkspace(workspaceId: string, options: any) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.getTransactionsByWorkspace(workspaceId, options));
        }
        throw new Error('RPC mode not implemented');
    }

    async getTransactionWithDetails(transactionId: string, _workspaceId: string) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.getTransactionById(transactionId));
        }
        throw new Error('RPC mode not implemented');
    }

    async create(workspaceId: string, userId: string, data: CreateTransactionDTO) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.createTransaction(data, userId, workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async update(workspaceId: string, transactionId: string, _userId: string, data: UpdateTransactionDTO) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.updateTransaction(transactionId, data, workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async delete(workspaceId: string, transactionId: string, _userId: string) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.deleteTransaction(transactionId, workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async transfer(workspaceId: string, userId: string, data: TransferDTO) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.transfer(data, userId, workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async link(workspaceId: string, transactionId: string, _userId: string, data: { linkedTransactionId: string }) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.linkTransaction(transactionId, { linkedTransactionId: data.linkedTransactionId }, workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async unlink(workspaceId: string, transactionId: string, _userId: string, data: { linkedId: string }) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.unlinkTransaction(transactionId, { linkedId: data.linkedId }, workspaceId));
        }
        throw new Error('RPC mode not implemented');
    }

    async getTransactionStats(accountId: string, startDate?: string, endDate?: string) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.getAccountStats(accountId, startDate, endDate));
        }
        throw new Error('RPC mode not implemented');
    }

    async getWorkspaceAccountStats(workspaceId: string, startDate?: string, endDate?: string) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.getWorkspaceAccountStats(workspaceId, startDate, endDate));
        }
        throw new Error('RPC mode not implemented');
    }

    async getWorkspaceStats(workspaceId: string, startDate?: string, endDate?: string) {
        if (this.getMode() === 'direct') {
            const service = await this.getService();
            return this.wrap(service.getWorkspaceStats(workspaceId, startDate, endDate));
        }
        throw new Error('RPC mode not implemented');
    }

    async countByAccountThisMonth(accountId: string): Promise<number> {
        if (this.getMode() === 'direct') {
            const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
            const { TransactionRepository } = require('@domains/transactions/repositories/TransactionRepository');
            const repo = new TransactionRepository(db);
            return repo.countByAccountThisMonth(accountId);
        }
        throw new Error('RPC mode not implemented');
    }
}