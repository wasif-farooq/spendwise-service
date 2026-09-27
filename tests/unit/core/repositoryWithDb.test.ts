import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { AccountRepository } from '@domains/accounts/repositories/AccountRepository';
import { CategoryRepository } from '@domains/categories/repositories/CategoryRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';

const makeDb = (name: string) =>
    ({
        name,
        query: jest.fn(async () => ({ rows: [] })),
        transaction: jest.fn(),
    }) as unknown as DatabaseFacade & { name: string; query: jest.Mock };

/**
 * Repositories are singletons. `withDb(trxDb)` used to rebind the shared
 * instance, so once the transaction's client was released every later request
 * failed with "Client was closed and is not queryable".
 */
describe('repository withDb', () => {
    it('returns a bound copy and leaves the shared TransactionRepository on the pool', async () => {
        const pool = makeDb('pool');
        const trx = makeDb('trx');
        const shared = new TransactionRepository(pool);

        const bound = shared.withDb(trx);
        expect(bound).not.toBe(shared);
        expect(bound).toBeInstanceOf(TransactionRepository);

        await bound.findById('t1');
        expect(trx.query).toHaveBeenCalledTimes(1);

        await shared.findById('t1');
        expect(pool.query).toHaveBeenCalledTimes(1);
        expect(trx.query).toHaveBeenCalledTimes(1);
    });

    it('does not rebind AccountRepository or CategoryRepository either', async () => {
        const pool = makeDb('pool');
        const trx = makeDb('trx');
        const accounts = new AccountRepository(pool);
        const categories = new CategoryRepository(pool);

        await accounts.withDb(trx).findById('a1');
        await categories.withDb(trx).findAll('w1');
        await accounts.findById('a1');
        await categories.findAll('w1');

        expect(trx.query).toHaveBeenCalledTimes(2);
        expect(pool.query).toHaveBeenCalledTimes(2);
    });
});
