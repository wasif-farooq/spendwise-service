import { Account } from '../models/Account';
import { DatabaseFacade } from '@facades/DatabaseFacade';

export interface AccountWithBalance {
  id: string;
  name: string;
  balance: number;
  currency: string;
}

export interface IAccountRepository {
  findById(id: string): Promise<Account | null>;
  /** `accountIds` (when given) restricts to those ids; an empty array matches nothing. */
  findByWorkspaceId(workspaceId: string, accountIds?: string[]): Promise<Account[]>;
  findByUserId(userId: string): Promise<Account[]>;
  save(account: Account): Promise<Account>;
  update(account: Account): Promise<Account>;
  delete(id: string): Promise<void>;
  deleteByWorkspaceId(workspaceId: string): Promise<void>;
  findAllWithBalancesForWorkspace(
    workspaceId: string,
    accountIds?: string[],
  ): Promise<AccountWithBalance[]>;
  updateBalance(id: string, balance: number): Promise<void>;
  updateIncomeExpense(id: string, totalIncome: number, totalExpense: number): Promise<void>;
  withDb(db: DatabaseFacade): IAccountRepository;
}
