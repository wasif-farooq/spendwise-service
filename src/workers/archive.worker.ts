import { TransactionArchiveService } from '@domains/transactions/services/ArchiveService';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { PostgresFactory } from '@database/factories/PostgresFactory';

export class ArchiveWorker {
    private db: DatabaseFacade;
    private archiveService: TransactionArchiveService;

    constructor() {
        const dbFactory = new PostgresFactory();
        this.db = new DatabaseFacade(dbFactory);
        this.archiveService = new TransactionArchiveService(this.db);
    }

    /**
     * Run monthly archival of old transactions
     * Archives transactions older than 2 years
     */
    async runMonthlyArchive(): Promise<void> {
        console.log('Starting monthly transaction archival...');

        // Archive transactions older than 2 years
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

        try {
            const result = await this.archiveService.archiveOldTransactions({
                olderThan: twoYearsAgo,
                batchSize: 1000,
            });

            console.log(`Archive complete: ${result.archived} archived, ${result.remaining} remaining`);
        } catch (error) {
            console.error('Archive failed:', error);
            throw error;
        }
    }

    /**
     * Run archive with custom date
     */
    async runArchive(olderThan: Date, batchSize = 1000): Promise<void> {
        console.log(`Starting archive for transactions older than ${olderThan.toISOString()}...`);

        const result = await this.archiveService.archiveOldTransactions({
            olderThan,
            batchSize,
        });

        console.log(`Archive complete: ${result.archived} archived, ${result.remaining} remaining`);
    }

    /**
     * Dry run to see how many would be archived
     */
    async dryRun(olderThan: Date): Promise<void> {
        const result = await this.archiveService.archiveOldTransactions({
            olderThan,
            dryRun: true,
        });

        console.log(`Dry run: Would archive ${result.archived} transactions, ${result.remaining} would remain`);
    }

    /**
     * Get archive statistics
     */
    async getStats(): Promise<void> {
        const stats = await this.archiveService.getArchiveStats();
        console.log('Archive stats:', stats);
    }

    /**
     * Cleanup connections
     */
    async shutdown(): Promise<void> {
        // Database cleanup if needed
        console.log('Archive worker shutdown complete');
    }
}

// CLI runner for archive worker
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const worker = new ArchiveWorker();

    (async () => {
        try {
            switch (command) {
                case 'run':
                    await worker.runMonthlyArchive();
                    break;
                case 'run-older':
                    const days = parseInt(args[1]) || 730;
                    const date = new Date();
                    date.setDate(date.getDate() - days);
                    await worker.runArchive(date);
                    break;
                case 'dry-run':
                    const dryRunDays = parseInt(args[1]) || 730;
                    const dryRunDate = new Date();
                    dryRunDate.setDate(dryRunDate.getDate() - dryRunDays);
                    await worker.dryRun(dryRunDate);
                    break;
                case 'stats':
                    await worker.getStats();
                    break;
                default:
                    console.log('Usage:');
                    console.log('  npm run archive:run          - Run monthly archive (2 years old)');
                    console.log('  npm run archive:run-older N  - Archive transactions older than N days');
                    console.log('  npm run archive:dry-run N    - Dry run for N days');
                    console.log('  npm run archive:stats        - Show archive statistics');
            }
        } finally {
            await worker.shutdown();
        }
        process.exit(0);
    })();
}
