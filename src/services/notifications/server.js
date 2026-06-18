import createServiceApp from '../../shared/app-factory.js';
import analyticsRoutes from '../../modules/analytics/analytics.fastify.routes.js';
import settingsRoutes from '../../modules/settings/settings.fastify.routes.js';
import notificationRoutes from '../../modules/notifications/routes/notification.fastify.routes.js';
import crmRoutes from '../../modules/crm/crm.fastify.routes.js';
import { scheduleExpiryReminders } from '../../modules/notifications/workers/expiry-reminder.handler.js';
import { scheduleReorderAlerts } from '../../modules/notifications/workers/reorder-alert.handler.js';
import { scheduleCrmJobs } from '../../modules/crm/jobs/scheduler.js';
import { initEventSubscriptions } from '../../modules/notifications/events/subscribers.js';

const start = async () => {
  const app = await createServiceApp({
    name: 'Notification & Reporting Service',
    description: 'Handles analytics, settings, CRM, and notifications',
  });

  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(notificationRoutes, { prefix: '/api/notifications' });
  await app.register(crmRoutes, { prefix: '/api/crm' });

  // Initialize event subscriptions
  await initEventSubscriptions(app);

  await scheduleExpiryReminders();
  await scheduleReorderAlerts();
  await scheduleCrmJobs();

  const port = process.env.SERVICE_PORT || 5004;
  await app.listen({ port, host: '0.0.0.0' });
};

start();
