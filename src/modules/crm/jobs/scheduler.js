import { crmQueue } from '../queue/crm.queue.js';
import logger from '../../../shared/utils/logger.js';

export const scheduleCrmJobs = async () => {
  logger.info('[CRM] Scheduling predictive engagement jobs');

  await crmQueue.add(
    'segmentation-analysis',
    {},
    {
      repeat: {
        pattern: '0 3 * * *',
      },
    },
  );

  await crmQueue.add(
    'process-reminders',
    {},
    {
      repeat: {
        pattern: '0 9 * * *',
      },
    },
  );

  await crmQueue.add(
    'process-subscriptions',
    {},
    {
      repeat: {
        pattern: '0 8 * * *',
      },
    },
  );
};
