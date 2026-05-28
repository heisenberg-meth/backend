import { mainQueue } from '../queue/index.js';
import logger from '../shared/utils/logger.js';

const cronManager = {
  init: async () => {
    logger.info('Initializing scheduled tasks...');
    
    // Add repeatable job for daily stock snapshot at 11:59 PM
    await mainQueue.add(
      'daily-stock-snapshot',
      {},
      {
        repeat: { pattern: '59 23 * * *' },
      },
    );

    // Add repeatable job for daily sales summary at 11:50 PM
    await mainQueue.add(
      'daily-sales-summary',
      {},
      {
        repeat: { pattern: '50 23 * * *' },
      },
    );

    // Add repeatable job for expiry scan every 6 hours
    await mainQueue.add(
      'expiry-scan',
      {},
      {
        repeat: { pattern: '0 */6 * * *' },
      },
    );

    // Add repeatable job for recommendation generation at midnight
    await mainQueue.add(
      'expiry-recommendation',
      {},
      {
        repeat: { pattern: '0 0 * * *' },
      },
    );

    // Add repeatable job for daily expiry check at midnight
    await mainQueue.add(
      'daily-expiry-check',
      {},
      {
        repeat: { pattern: '0 0 * * *' },
      },
    );

    // Add repeatable job for supplier overdue scan at 1:00 AM
    await mainQueue.add(
      'supplier-overdue-scan',
      {},
      {
        repeat: { pattern: '0 1 * * *' },
      },
    );

    // Add repeatable job for refill reminders at 9:00 AM
    await mainQueue.add(
      'refill-reminders',
      {},
      {
        repeat: { pattern: '0 9 * * *' },
      },
    );

    // Add repeatable job for inventory reconciliation at 2:00 AM
    await mainQueue.add(
      'inventory-reconciliation',
      {},
      {
        repeat: { pattern: '0 2 * * *' },
      },
    );

    // Patient feature cron jobs
    await mainQueue.add(
      'patient-refill-reminders',
      {},
      { repeat: { pattern: '0 */6 * * *' } },
    );

    await mainQueue.add(
      'patient-adherence-scoring',
      {},
      { repeat: { pattern: '0 2 * * *' } },
    );

    await mainQueue.add(
      'patient-prescription-expiry',
      {},
      { repeat: { pattern: '0 3 * * *' } },
    );
  }
};

export default cronManager;
