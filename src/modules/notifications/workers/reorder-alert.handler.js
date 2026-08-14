import { notificationQueue } from '../queue/notification.queue.js';

export const scheduleReorderAlerts = async () => {
  await notificationQueue.add(
    'reorder-alert',
    {},
    {
      repeat: {
        pattern: '0 */12 * * *', // Every 12 hours
      },
    },
  );
};
