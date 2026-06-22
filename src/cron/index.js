import { mainQueue } from '../queue/index.js';
import logger from '../shared/utils/logger.js';

const cronManager = {
  init: async () => {
    logger.info('Initializing scheduled tasks...');

    await mainQueue.add(
      'daily-stock-snapshot',
      {},
      {
        repeat: { pattern: '59 23 * * *' },
      },
    );

    await mainQueue.add(
      'daily-sales-summary',
      {},
      {
        repeat: { pattern: '50 23 * * *' },
      },
    );

    await mainQueue.add(
      'expiry-scan',
      {},
      {
        repeat: { pattern: '0 */6 * * *' },
      },
    );

    await mainQueue.add(
      'expiry-recommendation',
      {},
      {
        repeat: { pattern: '0 0 * * *' },
      },
    );

    await mainQueue.add(
      'daily-expiry-check',
      {},
      {
        repeat: { pattern: '0 0 * * *' },
      },
    );

    await mainQueue.add(
      'supplier-overdue-scan',
      {},
      {
        repeat: { pattern: '0 1 * * *' },
      },
    );

    await mainQueue.add(
      'refill-reminders',
      {},
      {
        repeat: { pattern: '0 9 * * *' },
      },
    );

    await mainQueue.add(
      'inventory-reconciliation',
      {},
      {
        repeat: { pattern: '0 2 * * *' },
      },
    );

    await mainQueue.add('patient-refill-reminders', {}, { repeat: { pattern: '0 */6 * * *' } });

    await mainQueue.add('patient-adherence-scoring', {}, { repeat: { pattern: '0 2 * * *' } });

    await mainQueue.add('patient-prescription-expiry', {}, { repeat: { pattern: '0 3 * * *' } });

    await mainQueue.add(
      'disposal-integrity-check',
      {},
      {
        repeat: { pattern: '0 4 * * *' },
      },
    );

    await mainQueue.add(
      'cleanup-expired-payment-sessions',
      {},
      {
        repeat: { pattern: '0 * * * *' },
      },
    );
  },
};

export default cronManager;
