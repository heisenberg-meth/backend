import { analyticsQueue } from '../queue/analytics.queue.js';
import logger from '../../../shared/utils/logger.js';

export const scheduleAnalyticsJobs = async () => {
  logger.info('[Analytics] Scheduling BI jobs');

  await analyticsQueue.add(
    'nightly-inventory-analysis',
    {},
    {
      repeat: {
        pattern: '0 2 * * *', // 2:00 AM every day
      },
    },
  );

  await analyticsQueue.add('hourly-revenue-aggregation', {}, {
    repeat: {
      pattern: '0 * * * *' // Minute 0 of every hour
    }
  });
};
