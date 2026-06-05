import controller from '../fastify/notification.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  // ── User Notification List ────────────────────────────────────
  fastify.get('/', {
    schema: { tags: ['Notifications'], summary: 'Get notifications for current user' },
    handler: controller.getUserNotifications,
  });

  fastify.put('/read-all', {
    schema: { tags: ['Notifications'], summary: 'Mark all notifications as read' },
    handler: controller.markAllNotificationsRead,
  });

  fastify.put('/:id/read', {
    schema: { tags: ['Notifications'], summary: 'Mark a notification as read' },
    handler: controller.markNotificationRead,
  });

  fastify.delete('/:id', {
    schema: { tags: ['Notifications'], summary: 'Delete a notification' },
    handler: controller.deleteUserNotification,
  });

  // ── Unified Send ──────────────────────────────────────────────
  fastify.post('/send', {
    schema: {
      tags: ['Notifications'],
      summary: 'Unified notification send - dispatches to any channel via orchestrator',
    },
    preHandler: requirePermission('notifications.send'),
    handler: controller.unifiedSend,
  });

  // ── Channel-specific ──────────────────────────────────────────
  fastify.post('/email', {
    schema: { tags: ['Notifications'], summary: 'Send email notification' },
    preHandler: requirePermission('notifications.send'),
    handler: controller.sendEmail,
  });

  fastify.post('/sms', {
    schema: { tags: ['Notifications'], summary: 'Send SMS notification' },
    preHandler: requirePermission('notifications.send'),
    handler: controller.sendSms,
  });

  fastify.post('/whatsapp', {
    schema: { tags: ['Notifications'], summary: 'Send WhatsApp notification' },
    preHandler: requirePermission('notifications.send'),
    handler: controller.sendWhatsApp,
  });

  fastify.post('/push', {
    schema: { tags: ['Notifications'], summary: 'Send push notification' },
    preHandler: requirePermission('notifications.send'),
    handler: controller.sendPush,
  });

  // ── OTP ───────────────────────────────────────────────────────
  fastify.post('/otp/send', {
    schema: { tags: ['Notifications'], summary: 'Send OTP for verification' },
    preHandler: requirePermission('notifications.send'),
    handler: controller.sendOtp,
  });

  fastify.post('/otp/verify', {
    schema: { tags: ['Notifications'], summary: 'Verify OTP' },
    handler: controller.verifyOtp,
  });

  // ── Status & Retry ────────────────────────────────────────────
  fastify.get('/:id/status', {
    schema: {
      tags: ['Notifications'],
      summary: 'Get notification delivery status with event history',
    },
    handler: controller.getNotificationStatus,
  });

  fastify.post('/:id/retry', {
    schema: { tags: ['Notifications'], summary: 'Retry a failed notification with fallback chain' },
    preHandler: requirePermission('notifications.retry'),
    handler: controller.retryNotification,
  });

  // ── History ───────────────────────────────────────────────────
  fastify.get('/history', {
    schema: { tags: ['Notifications'], summary: 'Paginated notification history with filters' },
    handler: controller.getHistory,
  });

  // ── Analytics ─────────────────────────────────────────────────
  fastify.get('/analytics', {
    schema: {
      tags: ['Notifications'],
      summary: 'Notification analytics - delivery stats, provider performance, response times',
    },
    handler: controller.getAnalytics,
  });

  // ── Templates ─────────────────────────────────────────────────
  fastify.get('/templates', {
    schema: { tags: ['Notifications'], summary: 'List all notification templates' },
    preHandler: requirePermission('notifications.templates.manage'),
    handler: controller.getTemplates,
  });

  fastify.post('/templates', {
    schema: { tags: ['Notifications'], summary: 'Create a notification template' },
    preHandler: requirePermission('notifications.templates.manage'),
    handler: controller.createTemplate,
  });

  fastify.put('/templates/:id', {
    schema: { tags: ['Notifications'], summary: 'Update a notification template' },
    preHandler: requirePermission('notifications.templates.manage'),
    handler: controller.updateTemplate,
  });

  fastify.delete('/templates/:id', {
    schema: { tags: ['Notifications'], summary: 'Delete a notification template' },
    preHandler: requirePermission('notifications.templates.manage'),
    handler: controller.deleteTemplate,
  });

  fastify.post('/templates/render', {
    schema: { tags: ['Notifications'], summary: 'Preview rendered template with variables' },
    handler: controller.renderTemplate,
  });

  // ── Throttling ────────────────────────────────────────────────
  fastify.get('/throttle', {
    schema: { tags: ['Notifications'], summary: 'Get current throttle status per channel' },
    handler: controller.getThrottleStatus,
  });

  // ── Patient Communication Preferences ─────────────────────────
  fastify.get('/patients/:patientId/preferences', {
    schema: { tags: ['Notifications'], summary: 'Get patient communication preferences' },
    handler: controller.getPatientPreferences,
  });

  fastify.put('/patients/:patientId/preferences', {
    schema: { tags: ['Notifications'], summary: 'Update patient communication preferences' },
    preHandler: requirePermission('patients.update'),
    handler: controller.updatePatientPreferences,
  });

  // ── Settings ──────────────────────────────────────────────────
  fastify.get('/settings', {
    schema: {
      tags: ['Notifications'],
      summary: 'Get tenant notification settings with provider configs',
    },
    handler: controller.getSettings,
  });

  fastify.put('/settings', {
    schema: { tags: ['Notifications'], summary: 'Update tenant notification settings' },
    preHandler: requirePermission('settings.update'),
    handler: controller.updateSettings,
  });

  // ── Provider Configuration ────────────────────────────────────
  fastify.get('/providers', {
    schema: { tags: ['Notifications'], summary: 'List notification provider configurations' },
    preHandler: requirePermission('notifications.templates.manage'),
    handler: controller.getProviderConfigs,
  });

  fastify.put('/providers', {
    schema: { tags: ['Notifications'], summary: 'Create or update a provider configuration' },
    preHandler: requirePermission('notifications.templates.manage'),
    handler: controller.upsertProviderConfig,
  });

  // ── Retry Logs ────────────────────────────────────────────────
  fastify.get('/retry-logs', {
    schema: { tags: ['Notifications'], summary: 'Get notification retry log history' },
    handler: controller.getRetryLogs,
  });

  // ── Ops Dashboard ─────────────────────────────────────────────
  fastify.get('/ops/history', {
    schema: {
      tags: ['Notifications'],
      summary: 'Get recent notification history for ops dashboard',
    },
    preHandler: requirePermission('notifications.view'),
    handler: controller.getOpsHistory,
  });

  fastify.get('/ops/queues/metrics', {
    schema: {
      tags: ['Notifications'],
      summary: 'Get real-time queue metrics for all notification channels',
    },
    preHandler: requirePermission('notifications.view'),
    handler: controller.getQueueMetrics,
  });
}
