import { notificationQueue } from '../queue/notification.queue.js';

export const scheduleExpiryReminders = async () => {
  await notificationQueue.add(
    'expiry-reminder',
    {},
    {
      repeat: {
        pattern: '0 */6 * * *', // Every 6 hours
      },
    },
  );
};
