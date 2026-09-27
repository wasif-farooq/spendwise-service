import { TransactionService, CreateTransactionDTO, TransferDTO } from '@domains/transactions/services/TransactionService';
import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { Transaction } from '@domains/transactions/models/Transaction';
import { AppError } from '@shared/errors/AppError';
import { IAccountRepository } from '@domains/accounts/repositories/IAccountRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { ExchangeRateService } from '@domains/exchange-rates/services/ExchangeRateService';

// Mock dependencies
jest.mock('@domains/transactions/repositories/TransactionRepository');
jest.mock('@domains/exchange-rates/services/ExchangeRateService');

const mockDb = {
    query: jest.fn(),
    transaction: jest.fn((cb) => cb(mockDb)),
    connect: jest.fn(),
    disconnect: jest.fn(),
    isConnected: jest.fn(() => true),
} as unknown as DatabaseFacade;

const mockTransactionRepo = {
    findById: jest.fn(),
    findByIdWithDetails: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findByWorkspaceId: jest.fn(),
    findByAccountId: jest.fn(),
    findByAccountIdCursor: jest.fn(),
    findByWorkspaceIdCursor: jest.fn(),
    getAccountStats: jest.fn(),
    getWorkspaceAccountStats: jest.fn(),
    getWorkspaceStats: jest.fn(),
    countByAccountThisMonth: jest.fn(),
    countByWorkspaceId: jest.fn(),
    withDb: jest.fn(() => mockTransactionRepo),
    invalidateAccountStatsCache: jest.fn(),
} as unknown as jest.Mocked<TransactionRepository>;

const mockAccountRepo = {
    findById: jest.fn(),
    withDb: jest.fn(() => mockAccountRepo),
    updateBalance: jest.fn(),
    updateIncomeExpense: jest.fn(),
} as unknown as jest.Mocked<IAccountRepository>;

const mockExchangeRateService = {
    convert: jest.fn(),
} as unknown as jest.Mocked<ExchangeRateService>;

function createService() {
    return new TransactionService(
        mockTransactionRepo as unknown as TransactionRepository,
        mockAccountRepo,
        mockDb,
        mockExchangeRateService as unknown as ExchangeRateService
    );
}

describe('TransactionService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createTransaction', () => {
        const createDto: CreateTransactionDTO = {
            accountId: 'acc-1',
            type: 'expense',
            amount: 100,
            currency: 'USD',
            description: 'Test transaction',
            date: '2024-01-15',
        };

        it('should create a transaction and update account balance', async () => {
            const savedTx = Transaction.create({
                ...createDto,
                userId: 'user-1',
                workspaceId: 'ws-1',
                date: new Date(createDto.date),
            });

            (mockAccountRepo.findById as jest.Mock).mockResolvedValue({
                id: 'acc-1',
                workspaceId: 'ws-1',
                currency: 'USD',
                name: 'Account',
            });
            (mockTransactionRepo.save as jest.Mock).mockResolvedValue(savedTx);
            (mockTransactionRepo.getAccountStats as jest.Mock).mockResolvedValue({
                totalIncome: 500,
                totalExpense: 200,
                balance: 300,
            });

            const service = createService();
            const result = await service.createTransaction(createDto, 'user-1', 'ws-1');

            expect(mockTransactionRepo.save).toHaveBeenCalled();
            expect(mockAccountRepo.updateBalance).toHaveBeenCalledWith('acc-1', 300);
            expect(result).toBeDefined();
        });

        it('should refuse an account belonging to another workspace', async () => {
            (mockAccountRepo.findById as jest.Mock).mockResolvedValue({
                id: 'acc-1',
                workspaceId: 'ws-victim',
                currency: 'USD',
                name: 'Victim account',
            });

            const service = createService();

            // The attacker holds a valid membership of ws-attacker and supplies
            // a victim account id in the request body.
            await expect(service.createTransaction(createDto, 'user-1', 'ws-attacker'))
                .rejects.toThrow(new AppError('Account not found', 404));

            expect(mockTransactionRepo.save).not.toHaveBeenCalled();
            expect(mockAccountRepo.updateBalance).not.toHaveBeenCalled();
        });

        it('should refuse an unknown account', async () => {
            (mockAccountRepo.findById as jest.Mock).mockResolvedValue(null);

            const service = createService();
            await expect(service.createTransaction(createDto, 'user-1', 'ws-1'))
                .rejects.toThrow(new AppError('Account not found', 404));

            expect(mockTransactionRepo.save).not.toHaveBeenCalled();
        });

        it('should refuse linking to another workspace transaction', async () => {
            (mockAccountRepo.findById as jest.Mock).mockResolvedValue({
                id: 'acc-1',
                workspaceId: 'ws-1',
                currency: 'USD',
                name: 'Account',
            });
            (mockTransactionRepo.findById as jest.Mock).mockResolvedValue(
                Transaction.create({
                    accountId: 'acc-victim',
                    userId: 'victim',
                    workspaceId: 'ws-victim',
                    type: 'expense',
                    amount: 10,
                    currency: 'USD',
                    date: new Date(),
                })
            );

            const service = createService();
            await expect(
                service.createTransaction(
                    { ...createDto, linkedTransactionIds: ['tx-victim'] },
                    'user-1',
                    'ws-1'
                )
            ).rejects.toThrow(new AppError('Linked transaction not found', 404));

            expect(mockTransactionRepo.save).not.toHaveBeenCalled();
        });
    });

    describe('transfer', () => {
        const transferDto: TransferDTO = {
            fromAccountId: 'acc-from',
            toAccountId: 'acc-to',
            amount: 500,
            currency: 'USD',
            date: '2024-01-15',
            description: 'Transfer between accounts',
        };

        it('should throw if source account not found', async () => {
            (mockAccountRepo.findById as jest.Mock).mockResolvedValue(null);

            const service = createService();
            await expect(service.transfer(transferDto, 'user-1', 'ws-1'))
                .rejects.toThrow(new AppError('Source account not found', 404));
        });

        it('should throw if destination account not found', async () => {
            (mockAccountRepo.findById as jest.Mock)
                .mockResolvedValueOnce({ workspaceId: 'ws-1', currency: 'USD', name: 'Source' })
                .mockResolvedValueOnce(null);

            const service = createService();
            await expect(service.transfer(transferDto, 'user-1', 'ws-1'))
                .rejects.toThrow(new AppError('Destination account not found', 404));
        });

        it('should throw if accounts belong to different workspaces', async () => {
            (mockAccountRepo.findById as jest.Mock)
                .mockResolvedValueOnce({ workspaceId: 'ws-1', currency: 'USD', name: 'Source' })
                .mockResolvedValueOnce({ workspaceId: 'ws-2', currency: 'USD', name: 'Dest' });

            const service = createService();
            // 404 rather than a descriptive 400: the caller must not learn
            // whether the other account exists in some other workspace.
            await expect(service.transfer(transferDto, 'user-1', 'ws-1'))
                .rejects.toThrow(new AppError('Account not found', 404));
        });

        it('should throw if both accounts belong to a workspace the caller is not in', async () => {
            (mockAccountRepo.findById as jest.Mock)
                .mockResolvedValue({ workspaceId: 'ws-victim', currency: 'USD', name: 'Victim' });

            const service = createService();
            await expect(service.transfer(transferDto, 'user-1', 'ws-attacker'))
                .rejects.toThrow(new AppError('Account not found', 404));
        });

        it('should throw if transferring to same account', async () => {
            const sameAccountDto = { ...transferDto, fromAccountId: 'acc-same', toAccountId: 'acc-same' };
            (mockAccountRepo.findById as jest.Mock)
                .mockResolvedValue({ workspaceId: 'ws-1', currency: 'USD', name: 'Same' });

            const service = createService();
            await expect(service.transfer(sameAccountDto, 'user-1', 'ws-1'))
                .rejects.toThrow(new AppError('Cannot transfer to the same account', 400));
        });

        it('should throw if insufficient balance', async () => {
            (mockAccountRepo.findById as jest.Mock)
                .mockResolvedValueOnce({ workspaceId: 'ws-1', currency: 'USD', name: 'Source' })
                .mockResolvedValueOnce({ workspaceId: 'ws-1', currency: 'USD', name: 'Dest' });
            (mockTransactionRepo.getAccountStats as jest.Mock).mockResolvedValue({
                totalIncome: 100,
                totalExpense: 80,
                balance: 20,
            });

            const service = createService();
            await expect(service.transfer(transferDto, 'user-1', 'ws-1'))
                .rejects.toThrow(new AppError('Insufficient balance', 400));
        });

        it('should succeed with same currency (no exchange rate needed)', async () => {
            (mockAccountRepo.findById as jest.Mock)
                .mockResolvedValueOnce({ workspaceId: 'ws-1', currency: 'USD', name: 'Source' })
                .mockResolvedValueOnce({ workspaceId: 'ws-1', currency: 'USD', name: 'Dest' });
            (mockTransactionRepo.getAccountStats as jest.Mock).mockResolvedValue({
                totalIncome: 1000,
                totalExpense: 200,
                balance: 800,
            });
            (mockTransactionRepo.save as jest.Mock).mockImplementation((tx: Transaction) => {
                const props = tx.getProps();
                return Promise.resolve(Transaction.restore(props, 'tx-' + Date.now()));
            });
            (mockTransactionRepo.update as jest.Mock).mockResolvedValue({});

            const service = new TransactionService(
                mockTransactionRepo as unknown as TransactionRepository,
                mockAccountRepo,
                mockDb,
                undefined
            );
            const result = await service.transfer(transferDto, 'user-1', 'ws-1');

            expect(result.withdraw).toBeDefined();
            expect(result.deposit).toBeDefined();
            expect(mockTransactionRepo.save).toHaveBeenCalledTimes(2);
            expect(mockAccountRepo.updateBalance).toHaveBeenCalledTimes(2);
        });

        it('should throw if exchange rate not available for different currencies', async () => {
            (mockAccountRepo.findById as jest.Mock)
                .mockResolvedValueOnce({ workspaceId: 'ws-1', currency: 'USD', name: 'Source' })
                .mockResolvedValueOnce({ workspaceId: 'ws-1', currency: 'EUR', name: 'Dest' });
            (mockTransactionRepo.getAccountStats as jest.Mock).mockResolvedValue({
                totalIncome: 1000,
                totalExpense: 200,
                balance: 800,
            });

            const service = new TransactionService(
                mockTransactionRepo as unknown as TransactionRepository,
                mockAccountRepo,
                mockDb,
                undefined
            );
            await expect(service.transfer(transferDto, 'user-1', 'ws-1'))
                .rejects.toThrow(new AppError('Exchange rate not available. Please provide one.', 400));
        });

        it('should use provided exchange rate for different currencies', async () => {
            const dtoWithRate: TransferDTO = {
                ...transferDto,
                exchangeRate: 0.85,
            };
            (mockAccountRepo.findById as jest.Mock)
                .mockResolvedValueOnce({ workspaceId: 'ws-1', currency: 'USD', name: 'Source' })
                .mockResolvedValueOnce({ workspaceId: 'ws-1', currency: 'EUR', name: 'Dest' });
            (mockTransactionRepo.getAccountStats as jest.Mock).mockResolvedValue({
                totalIncome: 1000,
                totalExpense: 200,
                balance: 800,
            });
            (mockTransactionRepo.save as jest.Mock).mockImplementation((tx: Transaction) => {
                const props = tx.getProps();
                return Promise.resolve(Transaction.restore(props, 'tx-' + Date.now()));
            });
            (mockTransactionRepo.update as jest.Mock).mockResolvedValue({});

            const service = createService();
            const result = await service.transfer(dtoWithRate, 'user-1', 'ws-1');

            expect(result.withdraw).toBeDefined();
            expect(result.deposit).toBeDefined();
        });
    });

    describe('linkTransaction', () => {
        it('should throw if transaction not found', async () => {
            (mockTransactionRepo.findById as jest.Mock).mockResolvedValue(null);

            const service = createService();
            await expect(service.linkTransaction('nonexistent', { linkedTransactionId: 'linked-1' }, 'ws-1'))
                .rejects.toThrow(new AppError('Transaction not found', 404));
        });

        it('should throw if transaction belongs to different workspace', async () => {
            const tx = Transaction.create({
                accountId: 'acc-1',
                userId: 'user-1',
                workspaceId: 'ws-other',
                type: 'expense',
                amount: 100,
                currency: 'USD',
                date: new Date(),
            });
            (mockTransactionRepo.findById as jest.Mock).mockResolvedValue(tx);

            const service = createService();
            await expect(service.linkTransaction(tx.id, { linkedTransactionId: 'linked-1' }, 'ws-1'))
                .rejects.toThrow(new AppError('Transaction not found', 404));
        });

        it('should refuse linking to a transaction in another workspace', async () => {
            const own = Transaction.create({
                accountId: 'acc-1',
                userId: 'user-1',
                workspaceId: 'ws-1',
                type: 'expense',
                amount: 100,
                currency: 'USD',
                date: new Date(),
            });
            const foreign = Transaction.create({
                accountId: 'acc-victim',
                userId: 'victim',
                workspaceId: 'ws-victim',
                type: 'expense',
                amount: 100,
                currency: 'USD',
                date: new Date(),
            });
            (mockTransactionRepo.findById as jest.Mock)
                .mockResolvedValueOnce(own)
                .mockResolvedValueOnce(foreign);

            const service = createService();
            await expect(service.linkTransaction(own.id, { linkedTransactionId: foreign.id }, 'ws-1'))
                .rejects.toThrow(new AppError('Linked transaction not found', 404));

            // Linking is bidirectional, so a missed check would write to the
            // foreign transaction.
            expect(mockTransactionRepo.update).not.toHaveBeenCalled();
        });

        it('should throw if linked transaction not found', async () => {
            const tx = Transaction.create({
                accountId: 'acc-1',
                userId: 'user-1',
                workspaceId: 'ws-1',
                type: 'expense',
                amount: 100,
                currency: 'USD',
                date: new Date(),
            });
            (mockTransactionRepo.findById as jest.Mock)
                .mockResolvedValueOnce(tx)
                .mockResolvedValueOnce(null);

            const service = createService();
            await expect(service.linkTransaction(tx.id, { linkedTransactionId: 'nonexistent' }, 'ws-1'))
                .rejects.toThrow(new AppError('Linked transaction not found', 404));
        });

        it('should throw if already linked', async () => {
            const tx = Transaction.create({
                accountId: 'acc-1',
                userId: 'user-1',
                workspaceId: 'ws-1',
                type: 'expense',
                amount: 100,
                currency: 'USD',
                date: new Date(),
                linkedTransactionIds: ['linked-1'],
            });
            const linkedTx = Transaction.create({
                accountId: 'acc-2',
                userId: 'user-1',
                workspaceId: 'ws-1',
                type: 'income',
                amount: 100,
                currency: 'USD',
                date: new Date(),
            });
            (mockTransactionRepo.findById as jest.Mock)
                .mockResolvedValueOnce(tx)
                .mockResolvedValueOnce(linkedTx);

            const service = createService();
            await expect(service.linkTransaction(tx.id, { linkedTransactionId: 'linked-1' }, 'ws-1'))
                .rejects.toThrow(new AppError('Transaction already linked', 400));
        });
    });

    describe('unlinkTransaction', () => {
        it('should throw if transaction not found', async () => {
            (mockTransactionRepo.findById as jest.Mock).mockResolvedValue(null);

            const service = createService();
            await expect(service.unlinkTransaction('nonexistent', { linkedId: 'linked-1' }, 'ws-1'))
                .rejects.toThrow(new AppError('Transaction not found', 404));
        });

        it('should remove link bidirectionally', async () => {
            const tx = Transaction.create({
                accountId: 'acc-1',
                userId: 'user-1',
                workspaceId: 'ws-1',
                type: 'expense',
                amount: 100,
                currency: 'USD',
                date: new Date(),
                linkedTransactionIds: ['linked-1', 'linked-2'],
            });
            const linkedTx = Transaction.create({
                accountId: 'acc-2',
                userId: 'user-1',
                workspaceId: 'ws-1',
                type: 'income',
                amount: 100,
                currency: 'USD',
                date: new Date(),
                linkedTransactionIds: [tx.id],
            });
            (mockTransactionRepo.findById as jest.Mock)
                .mockResolvedValueOnce(tx)
                .mockResolvedValueOnce(linkedTx);
            (mockTransactionRepo.update as jest.Mock).mockResolvedValue({});

            const service = createService();
            const result = await service.unlinkTransaction(tx.id, { linkedId: 'linked-1' }, 'ws-1');

            expect(mockTransactionRepo.update).toHaveBeenCalledTimes(2);
            expect(result).toBeDefined();
        });
    });

    describe('deleteTransaction', () => {
        it('should throw if transaction not found', async () => {
            (mockTransactionRepo.findById as jest.Mock).mockResolvedValue(null);

            const service = createService();
            await expect(service.deleteTransaction('nonexistent', 'ws-1'))
                .rejects.toThrow(new AppError('Transaction not found', 404));
        });

        it('should delete transaction and update balance', async () => {
            const tx = Transaction.create({
                accountId: 'acc-1',
                userId: 'user-1',
                workspaceId: 'ws-1',
                type: 'expense',
                amount: 100,
                currency: 'USD',
                date: new Date(),
            });
            (mockTransactionRepo.findById as jest.Mock).mockResolvedValue(tx);
            (mockTransactionRepo.delete as jest.Mock).mockResolvedValue(undefined);
            (mockTransactionRepo.getAccountStats as jest.Mock).mockResolvedValue({
                totalIncome: 500,
                totalExpense: 100,
                balance: 400,
            });

            const service = createService();
            await service.deleteTransaction(tx.id, 'ws-1');

            expect(mockTransactionRepo.delete).toHaveBeenCalledWith(tx.id);
            expect(mockAccountRepo.updateBalance).toHaveBeenCalledWith('acc-1', 400);
        });
    });

    describe('updateTransaction workspace scoping', () => {
        const ownTx = () =>
            Transaction.create({
                accountId: 'acc-1',
                userId: 'user-1',
                workspaceId: 'ws-1',
                type: 'expense',
                amount: 100,
                currency: 'USD',
                date: new Date(),
            });

        it('should refuse moving a transaction onto another workspace account', async () => {
            const tx = ownTx();
            (mockTransactionRepo.findById as jest.Mock).mockResolvedValue(tx);
            (mockAccountRepo.findById as jest.Mock).mockResolvedValue({
                id: 'acc-victim',
                workspaceId: 'ws-victim',
                currency: 'USD',
                name: 'Victim account',
            });

            const service = createService();
            await expect(
                service.updateTransaction(tx.id, { accountId: 'acc-victim' }, 'ws-1')
            ).rejects.toThrow(new AppError('Account not found', 404));

            expect(mockTransactionRepo.update).not.toHaveBeenCalled();
            expect(mockAccountRepo.updateBalance).not.toHaveBeenCalled();
        });

        it('should allow moving to an account in the same workspace', async () => {
            const tx = ownTx();
            (mockTransactionRepo.findById as jest.Mock).mockResolvedValue(tx);
            (mockAccountRepo.findById as jest.Mock).mockResolvedValue({
                id: 'acc-2',
                workspaceId: 'ws-1',
                currency: 'USD',
                name: 'Other account',
            });
            (mockTransactionRepo.update as jest.Mock).mockResolvedValue(tx);
            (mockTransactionRepo.getAccountStats as jest.Mock).mockResolvedValue({
                totalIncome: 0,
                totalExpense: 0,
                balance: 0,
            });

            const service = createService();
            await expect(
                service.updateTransaction(tx.id, { accountId: 'acc-2' }, 'ws-1')
            ).resolves.toBeDefined();
        });
    });

    describe('read scoping', () => {
        it('should refuse stats for an account in another workspace', async () => {
            (mockAccountRepo.findById as jest.Mock).mockResolvedValue({
                id: 'acc-victim',
                workspaceId: 'ws-victim',
                currency: 'USD',
                name: 'Victim account',
            });

            const service = createService();
            await expect(service.getAccountStats('acc-victim', 'ws-attacker'))
                .rejects.toThrow(new AppError('Account not found', 404));

            expect(mockTransactionRepo.getAccountStats).not.toHaveBeenCalled();
        });

        it('should refuse listing transactions for an account in another workspace', async () => {
            (mockAccountRepo.findById as jest.Mock).mockResolvedValue({
                id: 'acc-victim',
                workspaceId: 'ws-victim',
                currency: 'USD',
                name: 'Victim account',
            });

            const service = createService();
            await expect(
                service.getTransactionsByAccountCursor('acc-victim', 'ws-attacker', { limit: 50 })
            ).rejects.toThrow(new AppError('Account not found', 404));

            expect(mockTransactionRepo.findByAccountIdCursor).not.toHaveBeenCalled();
        });

        it('should allow stats for an account in the caller workspace', async () => {
            (mockAccountRepo.findById as jest.Mock).mockResolvedValue({
                id: 'acc-1',
                workspaceId: 'ws-1',
                currency: 'USD',
                name: 'Account',
            });
            (mockTransactionRepo.getAccountStats as jest.Mock).mockResolvedValue({
                totalIncome: 10,
                totalExpense: 4,
                balance: 6,
            });

            const service = createService();
            await expect(service.getAccountStats('acc-1', 'ws-1')).resolves.toEqual({
                totalIncome: 10,
                totalExpense: 4,
                balance: 6,
            });
        });
    });
});
