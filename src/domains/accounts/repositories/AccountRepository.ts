import { Account, AccountProps } from '../models/Account';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { IAccountRepository } from './IAccountRepository';

export class AccountRepository implements IAccountRepository {
    constructor(private db: DatabaseFacade) { }

    async findById(id: string): Promise<Account | null> {
        const result = await this.db.query(
            'SELECT * FROM accounts WHERE id = $1',
            [id]
        );
        return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
    }

    async findByOrganizationId(organizationId: string): Promise<Account[]> {
        const result = await this.db.query(
            'SELECT * FROM accounts WHERE organization_id = $1 ORDER BY created_at DESC',
            [organizationId]
        );
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    async countByOrganizationId(organizationId: string): Promise<number> {
        const result = await this.db.query(
            'SELECT COUNT(*) as count FROM accounts WHERE organization_id = $1',
            [organizationId]
        );
        return parseInt(result.rows[0]?.count || '0');
    }

    async findByUserId(userId: string): Promise<Account[]> {
        const result = await this.db.query(
            'SELECT * FROM accounts WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        return result.rows.map((row: any) => this.mapToEntity(row));
    }

    async save(account: Account): Promise<Account> {
        const data = account.getProps();
        const mappedData = {
            id: account.id,
            name: data.name,
            type: data.type,
            balance: data.balance,
            currency: data.currency,
            color: data.color,
            organization_id: data.organizationId,
            user_id: data.userId,
            last_activity: data.lastActivity,
            created_at: data.createdAt,
            updated_at: data.updatedAt,
        };

        const keys = Object.keys(mappedData);
        const values = Object.values(mappedData);
        const indices = keys.map((_, i) => `$${i + 1}`).join(', ');

        const query = `
            INSERT INTO accounts (${keys.join(', ')})
            VALUES (${indices})
            RETURNING *
        `;

        const result = await this.db.query(query, values);
        return this.mapToEntity(result.rows[0]);
    }

    async update(account: Account): Promise<Account> {
        const data = account.getProps();
        const query = `
            UPDATE accounts
            SET name = $1, type = $2, balance = $3, currency = $4, color = $5,
                last_activity = $6, updated_at = NOW()
            WHERE id = $7
            RETURNING *
        `;

        const result = await this.db.query(query, [
            data.name,
            data.type,
            data.balance,
            data.currency,
            data.color,
            data.lastActivity,
            account.id
        ]);

        if (result.rowCount === 0) {
            throw new Error('Account not found');
        }

        return this.mapToEntity(result.rows[0]);
    }

    async delete(id: string): Promise<void> {
        await this.db.query('DELETE FROM accounts WHERE id = $1', [id]);
    }

    async getTotalBalance(organizationId: string): Promise<number> {
        const result = await this.db.query(
            'SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE organization_id = $1',
            [organizationId]
        );
        return parseFloat(result.rows[0]?.total || '0');
    }

    private mapToEntity(row: any): Account {
        const props: AccountProps = {
            name: row.name,
            type: row.type,
            balance: parseFloat(row.balance),
            currency: row.currency,
            color: row.color,
            organizationId: row.organization_id,
            userId: row.user_id,
            lastActivity: new Date(row.last_activity),
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
        };
        return Account.restore(props, row.id);
    }
}
