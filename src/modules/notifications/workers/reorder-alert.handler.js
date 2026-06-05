import prisma from '../../../config/prisma.js';
import notificationService from '../services/notification.service.js';
import logger from '../../../shared/utils/logger.js';
import { notificationQueue } from '../queue/notification.queue.js';

export const processReorderAlert = async () => {
  logger.info('[Job] Running Reorder Alert Check');

  const alerts = await prisma.stockAlert.findMany({
    where: { isResolved: false, type: 'LOW_STOCK' },
    include: { medicine: true, tenant: { include: { users: true } } },
  });

  for (const alert of alerts) {
    const owner = alert.tenant.users.find((u) => u.role === 'OWNER');
    if (!owner) continue;

    const message = `Stock Alert: ${alert.medicine.name} is below the reorder level.`;

    await notificationService.queueNotification({
      tenantId: alert.tenantId,
      userId: owner.id,
      notificationType: 'REORDER_ALERT',
      channel: 'IN_APP',
      recipient: owner.id,
      subject: 'Low Stock Alert',
      message,
    });

    if (owner.phone) {
      await notificationService.queueNotification({
        tenantId: alert.tenantId,
        userId: owner.id,
        notificationType: 'REORDER_ALERT',
        channel: 'WHATSAPP',
        recipient: owner.phone,
        subject: 'Low Stock Alert',
        message,
      });
    }
  }
};

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
