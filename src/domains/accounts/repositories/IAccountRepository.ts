import { Account } from '../models/Account';
import { DatabaseFacade } from '@facades/DatabaseFacade';

export interface IAccountRepository {
    findById(id: string): Promise<Account | null>;
    findByWorkspaceId(workspaceId: string): Promise<Account[]>;
    findByUserId(userId: string): Promise<Account[]>;
    save(account: Account): Promise<Account>;
    update(account: Account): Promise<Account>;
    delete(id: string): Promise<void>;
    deleteByWorkspaceId(workspaceId: string): Promise<void>;
    getTotalBalance(workspaceId: string): Promise<number>;
    updateBalance(id: string, balance: number): Promise<void>;
    updateIncomeExpense(id: string, totalIncome: number, totalExpense: number): Promise<void>;
    withDb(db: DatabaseFacade): IAccountRepository;
}
