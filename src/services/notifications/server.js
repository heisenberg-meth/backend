import createServiceApp from '../../shared/app-factory.js';
import analyticsRoutes from '../../modules/analytics/analytics.fastify.routes.js';
import settingsRoutes from '../../modules/settings/settings.fastify.routes.js';
import notificationRoutes from '../../modules/notifications/routes/notification.fastify.routes.js';
import crmRoutes from '../../modules/crm/crm.fastify.routes.js';
import eventBus from '../../shared/services/eventbus.service.js';
import { queueEmail } from '../../shared/services/email.service.js';
import { scheduleExpiryReminders } from '../../modules/notifications/workers/expiry-reminder.handler.js';
import { scheduleReorderAlerts } from '../../modules/notifications/workers/reorder-alert.handler.js';
import { scheduleCrmJobs } from '../../modules/crm/jobs/scheduler.js';
import prisma from '../../config/prisma.js';
import notificationService from '../../modules/notifications/services/notification.service.js';

const start = async () => {
  const app = await createServiceApp({
    name: 'Notification & Reporting Service',
    description: 'Handles analytics, settings, CRM, and notifications',
  });

  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(notificationRoutes, { prefix: '/api/notifications' });
  await app.register(crmRoutes, { prefix: '/api/crm' });

  await eventBus.subscribe('notification_queue', 'USER_REGISTERED', async (data) => {
    app.log.info(`[CONSUMER] New user registered: ${data.email}`);
    await queueEmail(data.email, 'Welcome to Viyan MedAssist!', '<h1>Welcome!</h1>');
    try {
      await notificationService.createNotification({
        tenantId: data.tenantId,
        userId: data.userId,
        message: `Welcome to Viyan MedAssist, ${data.fullName}! Your registration was successful.`,
        subject: 'Welcome to Viyan MedAssist!',
        channel: 'IN_APP',
        notificationType: 'Users',
        recipient: data.email,
        deliveryStatus: 'DELIVERED',
      });
    } catch (err) {
      app.log.error(err, 'Failed to save USER_REGISTERED in-app notification');
    }
  });

  await eventBus.subscribe('notification_queue', 'LOW_STOCK_DETECTED', async (data) => {
    app.log.info(`[CONSUMER] Low stock detected for ${data.name} in tenant ${data.tenantId}`);
    try {
      const owner = await prisma.user.findFirst({
        where: { tenantId: data.tenantId, role: 'OWNER' },
      });
      if (owner) {
        await notificationService.createNotification({
          tenantId: data.tenantId,
          userId: owner.id,
          message: `Low stock warning: ${data.name} is running low on stock.`,
          subject: 'Low Stock Alert',
          channel: 'IN_APP',
          notificationType: 'Inventory',
          recipient: owner.id,
          deliveryStatus: 'DELIVERED',
        });
      }
    } catch (err) {
      app.log.error(err, 'Failed to save LOW_STOCK_DETECTED in-app notification');
    }
  });

  await eventBus.subscribe('notification_queue', 'PAYMENT_SUCCESS', async (data) => {
    app.log.info(`[CONSUMER] Payment successful for tenant ${data.tenantId}`);
    try {
      const owner = await prisma.user.findFirst({
        where: { tenantId: data.tenantId, role: 'OWNER' },
      });
      if (owner) {
        await notificationService.createNotification({
          tenantId: data.tenantId,
          userId: owner.id,
          message: `Payment of ₹${data.amount} was successful. Order ID: ${data.razorpayOrderId}.`,
          subject: 'Payment Successful',
          channel: 'IN_APP',
          notificationType: 'Billing',
          recipient: owner.id,
          deliveryStatus: 'DELIVERED',
        });
      }
    } catch (err) {
      app.log.error(err, 'Failed to save PAYMENT_SUCCESS in-app notification');
    }
  });

  await scheduleExpiryReminders();
  await scheduleReorderAlerts();
  await scheduleCrmJobs();

  const port = process.env.SERVICE_PORT || 5004;
  await app.listen({ port, host: '0.0.0.0' });
};

start();
