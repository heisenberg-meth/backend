import prisma from '../../../config/prisma.js';
import notificationService from '../services/notification.service.js';
import logger from '../../../shared/utils/logger.js';
import { notificationQueue } from '../queue/notification.queue.js';

export const processExpiryReminder = async () => {
  logger.info('[Job] Running Expiry Reminder Check');

  // Find alerts with high severity that haven't been resolved
  const alerts = await prisma.expiryAlert.findMany({
    where: { isResolved: false, daysRemaining: { lte: 30 } },
    include: { batch: true, medicine: true, tenant: { include: { users: true } } },
  });

  for (const alert of alerts) {
    const owner = alert.tenant.users.find((u) => u.role === 'OWNER');
    if (!owner) continue;

    const message = `Alert: Batch ${alert.batch.batchNumber} of ${alert.medicine.name} is expiring in ${alert.daysRemaining} days.`;

    // Create an internal system notification
    await notificationService.queueNotification({
      tenantId: alert.tenantId,
      userId: owner.id,
      notificationType: 'EXPIRY_ALERT',
      channel: 'IN_APP',
      recipient: owner.id,
      subject: 'Medicine Expiry Alert',
      message,
    });

    // Option to send SMS if severity is critical
    if (alert.daysRemaining <= 7) {
      if (owner.phone) {
        await notificationService.queueNotification({
          tenantId: alert.tenantId,
          userId: owner.id,
          notificationType: 'EXPIRY_ALERT',
          channel: 'SMS',
          recipient: owner.phone,
          subject: 'Medicine Expiry Alert',
          message,
        });
      }
    }
  }
};

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
