import { DatabaseFacade } from '../facades/DatabaseFacade';
import { PostgresFactory } from '../database/factories/PostgresFactory';
import { ExchangeRateRepository } from '../domains/exchange-rates/repositories/ExchangeRateRepository';
import { ExchangeRateService } from '../domains/exchange-rates/services/ExchangeRateService';

// Cron Jobs Configuration
const cronJobs = {
    exchangeRates: {
        enabled: process.env.CRON_EXCHANGE_RATES_ENABLED !== 'false',
        schedule: process.env.CRON_EXCHANGE_RATES_SCHEDULE || '0 2 * * *',
    },
};

function shouldRunCron(jobName: string): boolean {
    const job = cronJobs[jobName as keyof typeof cronJobs];
    return job?.enabled ?? false;
}

class CronScheduler {
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning = false;

    start(intervalMs: number = 60000) {
        console.log('🔄 Cron scheduler starting...');
        
        // Run immediately on start
        this.runExchangeRatesJob();

        // Then run every minute
        this.intervalId = setInterval(() => {
            this.checkAndRunJobs();
        }, intervalMs);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('🔄 Cron scheduler stopped');
        }
    }

    private async checkAndRunJobs() {
        if (this.isRunning) {
            return;
        }

        const now = new Date();
        
        // Check Exchange Rates job (daily at 2 AM)
        if (shouldRunCron('exchangeRates')) {
            if (now.getHours() === 2 && now.getMinutes() === 0) {
                await this.runExchangeRatesJob();
            }
        }
    }

    private async runExchangeRatesJob() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        console.log('📥 Running exchange rates cron job...');

        try {
            const db = new DatabaseFacade(new PostgresFactory());
            const repository = new ExchangeRateRepository(db);
            const service = new ExchangeRateService(repository);

            const result = await service.fetchAllRates();
            
            console.log('📥 Exchange rates job completed:', {
                success: result.success,
                results: result.results
            });
        } catch (error: any) {
            console.error('❌ Exchange rates cron job failed:', error);
        } finally {
            this.isRunning = false;
        }
    }

    // Manual trigger for testing
    async runNow(jobName: string) {
        console.log(`🔧 Manual trigger for job: ${jobName}`);
        
        switch (jobName) {
            case 'exchange-rates':
                await this.runExchangeRatesJob();
                break;
            default:
                console.warn(`Unknown job: ${jobName}`);
        }
    }
}

// Export singleton instance
export const cronScheduler = new CronScheduler();
