import { Account } from '../models/Account';

export interface IAccountRepository {
    findById(id: string): Promise<Account | null>;
    findByOrganizationId(organizationId: string): Promise<Account[]>;
    findByUserId(userId: string): Promise<Account[]>;
    save(account: Account): Promise<Account>;
    update(account: Account): Promise<Account>;
    delete(id: string): Promise<void>;
    getTotalBalance(organizationId: string): Promise<number>;
}
