import { DatabaseFacade } from '../facades/DatabaseFacade';
import { PostgresFactory } from '../database/factories/PostgresFactory';
import { ExchangeRateRepository } from '../domains/exchange-rates/repositories/ExchangeRateRepository';
import { ExchangeRateService } from '../domains/exchange-rates/services/ExchangeRateService';
import { ActivityLogRepository } from '../domains/activity/repositories/ActivityLogRepository';
import { CRYPTO_FLAG } from '../domains/currencies/currencies';

// Cron Jobs Configuration
const cronJobs = {
  exchangeRates: {
    enabled: process.env.CRON_EXCHANGE_RATES_ENABLED !== 'false',
    schedule: process.env.CRON_EXCHANGE_RATES_SCHEDULE || '0 2 * * *',
  },
  // Every N minutes, and only while the `crypto` feature flag is on.
  cryptoRates: {
    enabled: process.env.CRON_CRYPTO_RATES_ENABLED !== 'false',
    intervalMinutes: Math.max(
      1,
      parseInt(process.env.CRON_CRYPTO_RATES_INTERVAL_MINUTES || '10', 10) || 10,
    ),
  },
  activityPartitions: {
    enabled: process.env.CRON_ACTIVITY_PARTITIONS_ENABLED !== 'false',
    schedule: process.env.CRON_ACTIVITY_PARTITIONS_SCHEDULE || '0 0 1 * *',
  },
};

function shouldRunCron(jobName: string): boolean {
  const job = cronJobs[jobName as keyof typeof cronJobs];
  return job?.enabled ?? false;
}

type JobName = 'exchangeRates' | 'cryptoRates' | 'activityPartitions';

export interface SchedulerDeps {
  exchangeRates: () => Pick<ExchangeRateService, 'fetchAllRates' | 'fetchCryptoRates'>;
  isCryptoEnabled: () => Promise<boolean>;
  ensurePartitions: (from: Date, to: Date) => Promise<void>;
  now: () => Date;
}

export class CronScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private running = new Set<JobName>();
  private lastCryptoRun = 0;
  private db: DatabaseFacade | null = null;
  private deps: SchedulerDeps;

  constructor(deps: Partial<SchedulerDeps> = {}) {
    this.deps = {
      exchangeRates: () => new ExchangeRateService(new ExchangeRateRepository(this.database())),
      isCryptoEnabled: async () => {
        const result = await this.database().query(
          'SELECT enabled FROM feature_flags WHERE key = $1',
          [CRYPTO_FLAG],
        );
        return result.rows[0]?.enabled === true;
      },
      ensurePartitions: (from, to) =>
        new ActivityLogRepository(this.database()).ensurePartitionsExist(from, to),
      now: () => new Date(),
      ...deps,
    };
  }

  /** One pool for every run (a new DatabaseFacade per run leaked connections). */
  private database(): DatabaseFacade {
    if (!this.db) this.db = new DatabaseFacade(new PostgresFactory());
    return this.db;
  }

  start(intervalMs: number = 60000) {
    if (this.intervalId) return;
    console.log('🔄 Cron scheduler starting...');

    // Run immediately on start
    if (shouldRunCron('exchangeRates')) void this.runExchangeRatesJob();
    void this.checkCryptoRates();

    // Then check every minute
    this.intervalId = setInterval(() => {
      void this.checkAndRunJobs();
    }, intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🔄 Cron scheduler stopped');
    }
  }

  async checkAndRunJobs() {
    const now = this.deps.now();

    // Check Exchange Rates job (daily at 2 AM)
    if (shouldRunCron('exchangeRates')) {
      if (now.getHours() === 2 && now.getMinutes() === 0) {
        await this.runExchangeRatesJob();
      }
    }

    await this.checkCryptoRates();

    // Check Activity Partitions job (1st of every month at midnight)
    if (shouldRunCron('activityPartitions')) {
      if (now.getDate() === 1 && now.getHours() === 0 && now.getMinutes() === 0) {
        await this.runActivityPartitionJob();
      }
    }
  }

  /** Crypto rates when the interval has passed and the `crypto` flag is on. */
  async checkCryptoRates() {
    if (!shouldRunCron('cryptoRates')) return;
    const now = this.deps.now().getTime();
    if (now - this.lastCryptoRun < cronJobs.cryptoRates.intervalMinutes * 60_000) return;

    let enabled = false;
    try {
      enabled = await this.deps.isCryptoEnabled();
    } catch (error: any) {
      console.error('❌ Could not read the crypto flag:', error?.message);
    }
    if (!enabled) return;

    this.lastCryptoRun = now;
    await this.runCryptoRatesJob();
  }

  private async runJob(name: JobName, job: () => Promise<void>) {
    if (this.running.has(name)) return;
    this.running.add(name);
    try {
      await job();
    } catch (error: any) {
      console.error(`❌ ${name} cron job failed:`, error?.message ?? error);
    } finally {
      this.running.delete(name);
    }
  }

  private runExchangeRatesJob() {
    return this.runJob('exchangeRates', async () => {
      console.log('📥 Running exchange rates cron job...');
      const result = await this.deps.exchangeRates().fetchAllRates();
      console.log('📥 Exchange rates job completed:', {
        success: result.success,
        results: result.results,
      });
    });
  }

  private runCryptoRatesJob() {
    return this.runJob('cryptoRates', async () => {
      const result = await this.deps.exchangeRates().fetchCryptoRates();
      console.log('🪙 Crypto rates job completed:', {
        success: result.success,
        count: result.count,
        missing: result.missing,
        errors: result.errors,
      });
    });
  }

  private runActivityPartitionJob() {
    return this.runJob('activityPartitions', async () => {
      console.log('📅 Running activity partition creation job...');
      const monthsAhead = parseInt(process.env.ACTIVITY_LOG_PARTITION_MONTHS_AHEAD || '6');
      const now = new Date();
      const futureDate = new Date(now);
      futureDate.setMonth(futureDate.getMonth() + monthsAhead);
      await this.deps.ensurePartitions(now, futureDate);
      console.log(`📅 Activity partitions ensured for next ${monthsAhead} months`);
    });
  }

  // Manual trigger for testing
  async runNow(jobName: string) {
    console.log(`🔧 Manual trigger for job: ${jobName}`);

    switch (jobName) {
      case 'exchange-rates':
        await this.runExchangeRatesJob();
        break;
      case 'crypto-rates':
        await this.runCryptoRatesJob();
        break;
      case 'activity-partitions':
        await this.runActivityPartitionJob();
        break;
      default:
        console.warn(`Unknown job: ${jobName}`);
    }
  }
}

// Export singleton instance
export const cronScheduler = new CronScheduler();
