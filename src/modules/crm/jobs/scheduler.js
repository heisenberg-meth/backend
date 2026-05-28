import { crmQueue } from '../queue/crm.queue.js';
import logger from '../../../shared/utils/logger.js';

export const scheduleCrmJobs = async () => {
  logger.info('[CRM] Scheduling predictive engagement jobs');

  // 1. Run behavior analysis & segmentation nightly
  await crmQueue.add(
    'segmentation-analysis',
    {},
    {
      repeat: {
        pattern: '0 3 * * *', // 3:00 AM every day
      },
    },
  );

  // 2. Process Reminders
  await crmQueue.add(
    'process-reminders',
    {},
    {
      repeat: {
        pattern: '0 9 * * *', // 9:00 AM every day
      },
    },
  );

  // 3. Process Subscriptions
  await crmQueue.add(
    'process-subscriptions',
    {},
    {
      repeat: {
        pattern: '0 8 * * *', // 8:00 AM every day
      },
    },
  );
};
