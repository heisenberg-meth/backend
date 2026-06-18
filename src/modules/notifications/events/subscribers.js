import eventBus from '../../../shared/services/eventbus.service.js';
import { queueEmail } from '../../../shared/services/email.service.js';
import prisma from '../../../config/prisma.js';
import notificationService from '../services/notification.service.js';

export const initEventSubscriptions = async (app) => {
  const log = app.log || console;

  // ── USER_REGISTERED ──────────────────────────────────────────────────────────
  await eventBus.subscribe('notification_queue', 'USER_REGISTERED', async (data) => {
    log.info(`[CONSUMER] New user registered: ${data.email}`);
    await queueEmail(data.email, 'Welcome to Viyan MedAssist!', '<h1>Welcome!</h1>');

    try {
      const result = await notificationService.queueNotification({
        tenantId: data.tenantId,
        userId: data.userId,
        message: `Welcome to Viyan MedAssist, ${data.fullName}! Your registration was successful.`,
        subject: 'Welcome to Viyan MedAssist!',
        channel: 'IN_APP',
        notificationType: 'Users',
        recipient: data.email,
      });

      if (!result.success) {
        log.warn(
          { reason: result.reason, email: data.email },
          'USER_REGISTERED in-app notification not created',
        );
      }
    } catch (err) {
      log.error(err, 'Failed to save USER_REGISTERED in-app notification');
    }
  });

  // ── LOW_STOCK_DETECTED ────────────────────────────────────────────────────────
  await eventBus.subscribe('notification_queue', 'LOW_STOCK_DETECTED', async (data) => {
    log.info(`[CONSUMER] Low stock detected for ${data.name} in tenant ${data.tenantId}`);

    try {
      const owner = await prisma.user.findFirst({
        where: { tenantId: data.tenantId, role: 'OWNER' },
      });

      if (owner) {
        const result = await notificationService.queueNotification({
          tenantId: data.tenantId,
          userId: owner.id,
          message: `Low stock warning: ${data.name} is running low on stock.`,
          subject: 'Low Stock Alert',
          channel: 'IN_APP',
          notificationType: 'Inventory',
          recipient: owner.id,
        });

        if (!result.success) {
          log.warn(
            { reason: result.reason, tenantId: data.tenantId },
            'LOW_STOCK_DETECTED in-app notification not created',
          );
        }
      } else {
        log.warn({ tenantId: data.tenantId }, 'No OWNER user found for tenant — low stock alert skipped');
      }
    } catch (err) {
      log.error(err, 'Failed to save LOW_STOCK_DETECTED in-app notification');
    }
  });

  // ── PAYMENT_SUCCESS ───────────────────────────────────────────────────────────
  await eventBus.subscribe('notification_queue', 'PAYMENT_SUCCESS', async (data) => {
    log.info(`[CONSUMER] Payment successful for tenant ${data.tenantId}`);

    try {
      const owner = await prisma.user.findFirst({
        where: { tenantId: data.tenantId, role: 'OWNER' },
      });

      if (owner) {
        const result = await notificationService.queueNotification({
          tenantId: data.tenantId,
          userId: owner.id,
          message: `Payment of ₹${data.amount} was successful. Order ID: ${data.razorpayOrderId}.`,
          subject: 'Payment Successful',
          channel: 'IN_APP',
          notificationType: 'Billing',
          recipient: owner.id,
        });

        if (!result.success) {
          log.warn(
            { reason: result.reason, tenantId: data.tenantId },
            'PAYMENT_SUCCESS in-app notification not created',
          );
        }
      } else {
        log.warn({ tenantId: data.tenantId }, 'No OWNER user found for tenant — payment notification skipped');
      }
    } catch (err) {
      log.error(err, 'Failed to save PAYMENT_SUCCESS in-app notification');
    }
  });
};
