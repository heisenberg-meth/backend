import controller from './controllers/notification-settings.controller.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import { requirePermission } from '../../middleware/permission.fastify.js';

async function notificationSettingsRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  // ── Core Settings ──
  fastify.get('/notifications', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Get notification governance settings',
      querystring: {
        type: 'object',
        properties: {
          branchId: { type: 'string' },
        },
      },
    },
  }, controller.getSettings);

  fastify.put('/notifications', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Update notification governance settings',
      body: {
        type: 'object',
        properties: {
          smsEnabled: { type: 'boolean' },
          whatsappEnabled: { type: 'boolean' },
          emailEnabled: { type: 'boolean' },
          inAppEnabled: { type: 'boolean' },
          pushEnabled: { type: 'boolean' },
          refillReminderDaysBefore: { type: 'integer', minimum: 1, maximum: 30 },
          appointmentReminderHoursBefore: { type: 'integer', minimum: 1, maximum: 168 },
          expiryReminderDaysBefore: { type: 'integer', minimum: 1, maximum: 90 },
          maxRetries: { type: 'integer', minimum: 0, maximum: 10 },
          cooldownMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
          retryBackoffStrategy: { type: 'string', enum: ['linear', 'exponential', 'fixed'] },
          criticalEscalationEnabled: { type: 'boolean' },
          escalationTimeoutMinutes: { type: 'integer', minimum: 5, maximum: 1440 },
          maxEscalationLevels: { type: 'integer', minimum: 1, maximum: 5 },
          maxNotificationsPerHour: { type: 'integer', minimum: 1, maximum: 1000 },
          maxRemindersPerDay: { type: 'integer', minimum: 1, maximum: 50 },
          duplicateSuppressionMinutes: { type: 'integer', minimum: 1, maximum: 1440 },
          respectOptOuts: { type: 'boolean' },
          consentRequired: { type: 'boolean' },
          defaultFallbackChannel: { type: 'string', enum: ['sms', 'whatsapp', 'email', 'in_app', 'push'] },
        },
      },
    },
    preHandler: [requirePermission('settings.notifications.update')],
  }, controller.updateSettings);

  // ── Channel Configs ──
  fastify.get('/notifications/channels', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Get channel configurations',
      querystring: {
        type: 'object',
        properties: {
          channelType: { type: 'string', enum: ['SMS', 'WHATSAPP', 'EMAIL', 'PUSH', 'IN_APP'] },
        },
      },
    },
  }, controller.getChannels);

  fastify.put('/notifications/channels', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Create or update channel configuration',
      body: {
        type: 'object',
        required: ['channelType', 'providerName'],
        properties: {
          channelType: { type: 'string', enum: ['SMS', 'WHATSAPP', 'EMAIL', 'PUSH', 'IN_APP'] },
          providerName: { type: 'string', maxLength: 100 },
          providerConfig: { type: 'object' },
          isActive: { type: 'boolean' },
          priority: { type: 'integer', minimum: 0, maximum: 100 },
          dailyLimit: { type: 'integer', minimum: 1 },
          rateLimitPerMinute: { type: 'integer', minimum: 1, maximum: 1000 },
        },
      },
    },
    preHandler: [requirePermission('notifications.channels.manage')],
  }, controller.upsertChannel);

  fastify.delete('/notifications/channels/:id', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Delete channel configuration',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    preHandler: [requirePermission('notifications.channels.manage')],
  }, controller.deleteChannel);

  // ── Escalation Policies ──
  fastify.get('/notifications/escalations', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Get escalation policies',
      querystring: {
        type: 'object',
        properties: {
          triggerType: { type: 'string', enum: ['time_based', 'count_based', 'severity_based'] },
        },
      },
    },
  }, controller.getEscalations);

  fastify.post('/notifications/escalations', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Create escalation policy',
      body: {
        type: 'object',
        required: ['name', 'triggerType', 'triggerCondition', 'escalationChain'],
        properties: {
          name: { type: 'string', maxLength: 255 },
          description: { type: 'string', maxLength: 500 },
          triggerType: { type: 'string', enum: ['time_based', 'count_based', 'severity_based'] },
          isActive: { type: 'boolean' },
          triggerCondition: { type: 'object' },
          escalationChain: {
            type: 'array',
            minItems: 1,
            maxItems: 5,
            items: {
              type: 'object',
              required: ['level', 'role', 'channels'],
              properties: {
                level: { type: 'integer', minimum: 1, maximum: 5 },
                role: { type: 'string' },
                channels: { type: 'array', items: { type: 'string' }, minItems: 1 },
              },
            },
          },
          appliesTo: { type: 'string', enum: ['all', 'stock_alerts', 'refill_reminders', 'critical_only'] },
        },
      },
    },
    preHandler: [requirePermission('settings.notifications.update')],
  }, controller.createEscalation);

  fastify.put('/notifications/escalations/:id', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Update escalation policy',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    preHandler: [requirePermission('settings.notifications.update')],
  }, controller.updateEscalation);

  fastify.delete('/notifications/escalations/:id', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Delete escalation policy',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    preHandler: [requirePermission('settings.notifications.update')],
  }, controller.deleteEscalation);

  // ── Reminder Rules ──
  fastify.get('/notifications/reminders', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Get reminder rules',
      querystring: {
        type: 'object',
        properties: {
          reminderType: { type: 'string', enum: ['refill', 'appointment', 'expiry', 'followup', 'lab_result'] },
        },
      },
    },
  }, controller.getReminders);

  fastify.post('/notifications/reminders', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Create reminder rule',
      body: {
        type: 'object',
        required: ['name', 'reminderType', 'offsetDays', 'channels'],
        properties: {
          name: { type: 'string', maxLength: 255 },
          reminderType: { type: 'string', enum: ['refill', 'appointment', 'expiry', 'followup', 'lab_result'] },
          isActive: { type: 'boolean' },
          offsetDays: { type: 'integer', minimum: 0, maximum: 365 },
          offsetHours: { type: 'integer', minimum: 0, maximum: 23 },
          channels: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
          templateKey: { type: 'string', maxLength: 255 },
          patientFilter: { type: 'object' },
          medicineFilter: { type: 'object' },
          maxPerDay: { type: 'integer', minimum: 1, maximum: 20 },
          cooldownHours: { type: 'integer', minimum: 1, maximum: 168 },
        },
      },
    },
    preHandler: [requirePermission('settings.notifications.update')],
  }, controller.createReminder);

  fastify.put('/notifications/reminders/:id', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Update reminder rule',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    preHandler: [requirePermission('settings.notifications.update')],
  }, controller.updateReminder);

  fastify.delete('/notifications/reminders/:id', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Delete reminder rule',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    preHandler: [requirePermission('settings.notifications.update')],
  }, controller.deleteReminder);

  // ── Opt-Outs (Compliance) ──
  fastify.get('/notifications/opt-outs', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Get communication opt-outs',
      querystring: {
        type: 'object',
        properties: {
          patientId: { type: 'string' },
          phoneNumber: { type: 'string' },
          channel: { type: 'string' },
        },
      },
    },
  }, controller.getOptOuts);

  fastify.post('/notifications/opt-outs', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Record communication opt-out',
      body: {
        type: 'object',
        properties: {
          patientId: { type: 'string' },
          userId: { type: 'string' },
          phoneNumber: { type: 'string', maxLength: 20 },
          email: { type: 'string', format: 'email' },
          channel: { type: 'string', enum: ['SMS', 'WHATSAPP', 'EMAIL', 'PUSH', 'IN_APP'] },
          reminderType: { type: 'string', enum: ['refill', 'appointment', 'expiry', 'followup', 'lab_result'] },
          reason: { type: 'string', maxLength: 255 },
        },
      },
    },
  }, controller.createOptOut);

  fastify.post('/notifications/opt-outs/:id/revoke', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Revoke communication opt-out',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    preHandler: [requirePermission('settings.notifications.update')],
  }, controller.revokeOptOut);

  // ── Retry / DLQ ──
  fastify.get('/notifications/retries', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Get pending retries or DLQ entries',
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['pending', 'dlq'], default: 'pending' },
        },
      },
    },
  }, controller.getRetries);

  fastify.post('/notifications/retries/:id/recover', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Recover a retry from dead letter queue',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
    preHandler: [requirePermission('settings.notifications.update')],
  }, controller.recoverFromDLQ);

  // ── Test Notification ──
  fastify.post('/notifications/test', {
    schema: {
      tags: ['Notification Settings'],
      summary: 'Send a test notification',
      body: {
        type: 'object',
        required: ['channel', 'recipient'],
        properties: {
          channel: { type: 'string', enum: ['sms', 'whatsapp', 'email', 'in_app'] },
          recipient: { type: 'string' },
          message: { type: 'string', maxLength: 1000 },
        },
      },
    },
    preHandler: [requirePermission('settings.notifications.update')],
  }, controller.testNotification);
}

export default notificationSettingsRoutes;
