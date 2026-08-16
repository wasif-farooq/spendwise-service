// Cron Jobs Configuration

export const cronJobs = {
  // Exchange Rates - runs daily at 2:00 AM
  exchangeRates: {
    enabled: process.env.CRON_EXCHANGE_RATES_ENABLED !== 'false',
    schedule: process.env.CRON_EXCHANGE_RATES_SCHEDULE || '0 2 * * *', // Daily at 2 AM
    description: 'Fetch latest exchange rates from external API',
  },

  // Activity Partitions - runs 1st of every month at midnight
  activityPartitions: {
    enabled: process.env.CRON_ACTIVITY_PARTITIONS_ENABLED !== 'false',
    schedule: process.env.CRON_ACTIVITY_PARTITIONS_SCHEDULE || '0 0 1 * *', // 1st of month at midnight
    description: 'Ensure activity log partitions exist for upcoming months',
  },

  // Other cron jobs can be added here
  // cleanup: {
  //     enabled: true,
  //     schedule: '0 3 * * *', // Daily at 3 AM
  //     description: 'Clean up old data',
  // },
};

// Helper to check if a cron job should run
export function shouldRunCron(jobName: keyof typeof cronJobs): boolean {
  const job = cronJobs[jobName];
  return job?.enabled ?? false;
}
