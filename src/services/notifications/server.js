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

const start = async () => {
  const app = await createServiceApp({
    name: 'Notification & Reporting Service',
    description: 'Handles analytics, settings, CRM, and notifications'
  });

  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(notificationRoutes, { prefix: '/api/notifications' });
  await app.register(crmRoutes, { prefix: '/api/crm' });

  // Setup Event Consumers
  await eventBus.subscribe('notification_queue', 'USER_REGISTERED', async (data) => {
    app.log.info(`[CONSUMER] New user registered: ${data.email}`);
    // Example: send welcome email
    await queueEmail(data.email, 'Welcome to Viyan MedAssist!', '<h1>Welcome!</h1>');
  });

  await eventBus.subscribe('notification_queue', 'LOW_STOCK_DETECTED', async (data) => {
    app.log.info(`[CONSUMER] Low stock detected for ${data.name} in tenant ${data.tenantId}`);
    // Example: look up tenant owner email and send alert
  });

  await eventBus.subscribe('notification_queue', 'PAYMENT_SUCCESS', async (data) => {
    app.log.info(`[CONSUMER] Payment successful for tenant ${data.tenantId}`);
  });

  // Start Cron Jobs
  await scheduleExpiryReminders();
  await scheduleReorderAlerts();
  await scheduleCrmJobs();

  const port = process.env.SERVICE_PORT || 5004;
  await app.listen({ port, host: '0.0.0.0' });
};

start();
