import service from '../services/notification-settings.service.js';
import {
  notificationSettingsSchema,
  channelConfigSchema,
  escalationPolicySchema,
  reminderRuleSchema,
  optOutSchema,
  testNotificationSchema,
} from '../validators/notification-settings.validators.js';
import logger from '../../../shared/utils/logger.js';

class NotificationSettingsController {
  // ── GET /api/settings/notifications ──
  async getSettings(req, reply) {
    if (!req.tenantId) {
      return reply.code(401).send({ success: false, error: 'Unauthorized: tenant not found' });
    }
    const tenantId = req.tenantId;
    const { branchId } = req.query;
    try {
      const settings = await service.getSettings(tenantId, branchId || null);

      return reply.send({
        success: true,
        data: settings,
      });
    } catch (err) {
      logger.error({ err, tenantId }, 'Failed to get notification settings');
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve notification settings',
      });
    }
  }

  // ── PUT /api/settings/notifications ──
  async updateSettings(req, reply) {
    if (!req.tenantId) {
      return reply.code(401).send({ success: false, error: 'Unauthorized: tenant not found' });
    }
    const tenantId = req.tenantId;
    const { branchId } = req.query;
    const updatedBy = req.user?.email || req.user?.id;
    try {
      const validated = notificationSettingsSchema.parse(req.body);

      const settings = await service.updateSettings(
        tenantId,
        validated,
        updatedBy,
        branchId || null,
      );

      return reply.send({
        success: true,
        data: settings,
        message: 'Notification settings updated',
      });
    } catch (err) {
      if (err.errors) {
        logger.warn({ err, tenantId }, 'Zod validation failed for notification settings');
        return reply.code(400).send({
          success: false,
          error: 'Validation failed',
          details: err.errors,
        });
      }

      // Determine if it's a business logic error vs DB error
      if (err.message && err.message.includes('Cannot enable')) {
        logger.warn({ err, tenantId }, 'Business validation failed for notification settings');
        return reply.code(400).send({
          success: false,
          error: err.message,
        });
      }

      logger.error(
        { err, tenantId, stack: err.stack },
        'Database or unexpected error updating notification settings',
      );
      return reply.code(500).send({
        success: false,
        error: err.message || 'Failed to update notification settings',
      });
    }
  }

  // ── GET /api/settings/notifications/channels ──
  async getChannels(req, reply) {
    try {
      const tenantId = req.tenantId;
      const { channelType } = req.query;

      const channels = await service.getChannelConfigs(tenantId, channelType);

      return reply.send({
        success: true,
        data: channels,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to get channel configs');
      return reply.code(500).send({ success: false, error: 'Failed to retrieve channels' });
    }
  }

  // ── PUT /api/settings/notifications/channels ──
  async upsertChannel(req, reply) {
    try {
      const tenantId = req.tenantId;
      const validated = channelConfigSchema.parse(req.body);

      const config = await service.upsertChannelConfig(tenantId, validated);

      return reply.send({
        success: true,
        data: config,
        message: 'Channel configuration updated',
      });
    } catch (err) {
      if (err.errors) {
        return reply
          .code(400)
          .send({ success: false, error: 'Validation failed', details: err.errors });
      }
      return reply.code(500).send({ success: false, error: 'Failed to update channel' });
    }
  }

  // ── DELETE /api/settings/notifications/channels/:id ──
  async deleteChannel(req, reply) {
    const tenantId = req.tenantId;
    const { id } = req.params;
    try {
      await service.deleteChannelConfig(tenantId, id);

      return reply.send({ success: true, message: 'Channel configuration deleted' });
    } catch (err) {
      logger.error({ err, id, tenantId }, '[NOTIFICATION] Failed to delete channel');
      return reply.code(500).send({ success: false, error: 'Failed to delete channel' });
    }
  }

  // ── GET /api/settings/notifications/escalations ──
  async getEscalations(req, reply) {
    const tenantId = req.tenantId;
    try {
      const { triggerType } = req.query;

      const policies = await service.getEscalationPolicies(tenantId, triggerType);

      return reply.send({ success: true, data: policies });
    } catch (err) {
      logger.error({ err, tenantId }, '[NOTIFICATION] Failed to retrieve escalation policies');
      return reply
        .code(500)
        .send({ success: false, error: 'Failed to retrieve escalation policies' });
    }
  }

  // ── POST /api/settings/notifications/escalations ──
  async createEscalation(req, reply) {
    try {
      const tenantId = req.tenantId;
      const validated = escalationPolicySchema.parse(req.body);

      const policy = await service.createEscalationPolicy(tenantId, validated);

      return reply
        .code(201)
        .send({ success: true, data: policy, message: 'Escalation policy created' });
    } catch (err) {
      if (err.errors) {
        return reply
          .code(400)
          .send({ success: false, error: 'Validation failed', details: err.errors });
      }
      return reply.code(500).send({ success: false, error: 'Failed to create escalation policy' });
    }
  }

  // ── PUT /api/settings/notifications/escalations/:id ──
  async updateEscalation(req, reply) {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;
      const validated = escalationPolicySchema.parse(req.body);

      const policy = await service.updateEscalationPolicy(tenantId, id, validated);

      return reply.send({ success: true, data: policy, message: 'Escalation policy updated' });
    } catch (err) {
      if (err.errors) {
        return reply
          .code(400)
          .send({ success: false, error: 'Validation failed', details: err.errors });
      }
      return reply.code(500).send({ success: false, error: 'Failed to update escalation policy' });
    }
  }

  // ── DELETE /api/settings/notifications/escalations/:id ──
  async deleteEscalation(req, reply) {
    const tenantId = req.tenantId;
    const { id } = req.params;
    try {
      await service.deleteEscalationPolicy(tenantId, id);

      return reply.send({ success: true, message: 'Escalation policy deleted' });
    } catch (err) {
      logger.error({ err, id, tenantId }, '[NOTIFICATION] Failed to delete escalation policy');
      return reply.code(500).send({ success: false, error: 'Failed to delete escalation policy' });
    }
  }

  // ── GET /api/settings/notifications/reminders ──
  async getReminders(req, reply) {
    const tenantId = req.tenantId;
    try {
      const { reminderType } = req.query;

      const rules = await service.getReminderRules(tenantId, reminderType);

      return reply.send({ success: true, data: rules });
    } catch (err) {
      logger.error({ err, tenantId }, '[NOTIFICATION] Failed to retrieve reminder rules');
      return reply.code(500).send({ success: false, error: 'Failed to retrieve reminder rules' });
    }
  }

  // ── POST /api/settings/notifications/reminders ──
  async createReminder(req, reply) {
    try {
      const tenantId = req.tenantId;
      const validated = reminderRuleSchema.parse(req.body);

      const rule = await service.createReminderRule(tenantId, validated);

      return reply.code(201).send({ success: true, data: rule, message: 'Reminder rule created' });
    } catch (err) {
      if (err.errors) {
        return reply
          .code(400)
          .send({ success: false, error: 'Validation failed', details: err.errors });
      }
      return reply.code(500).send({ success: false, error: 'Failed to create reminder rule' });
    }
  }

  // ── PUT /api/settings/notifications/reminders/:id ──
  async updateReminder(req, reply) {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;
      const validated = reminderRuleSchema.parse(req.body);

      const rule = await service.updateReminderRule(tenantId, id, validated);

      return reply.send({ success: true, data: rule, message: 'Reminder rule updated' });
    } catch (err) {
      if (err.errors) {
        return reply
          .code(400)
          .send({ success: false, error: 'Validation failed', details: err.errors });
      }
      return reply.code(500).send({ success: false, error: 'Failed to update reminder rule' });
    }
  }

  // ── DELETE /api/settings/notifications/reminders/:id ──
  async deleteReminder(req, reply) {
    const tenantId = req.tenantId;
    const { id } = req.params;
    try {
      await service.deleteReminderRule(tenantId, id);

      return reply.send({ success: true, message: 'Reminder rule deleted' });
    } catch (err) {
      logger.error({ err, id, tenantId }, '[NOTIFICATION] Failed to delete reminder rule');
      return reply.code(500).send({ success: false, error: 'Failed to delete reminder rule' });
    }
  }

  // ── POST /api/settings/notifications/opt-outs ──
  async createOptOut(req, reply) {
    try {
      const tenantId = req.tenantId;
      const validated = optOutSchema.parse(req.body);
      const optedOutBy = req.user?.role === 'owner' ? 'staff' : 'patient';

      const optOut = await service.createOptOut(tenantId, validated, optedOutBy);

      return reply.code(201).send({ success: true, data: optOut, message: 'Opt-out recorded' });
    } catch (err) {
      if (err.errors) {
        return reply
          .code(400)
          .send({ success: false, error: 'Validation failed', details: err.errors });
      }
      return reply.code(500).send({ success: false, error: 'Failed to record opt-out' });
    }
  }

  // ── POST /api/settings/notifications/opt-outs/:id/revoke ──
  async revokeOptOut(req, reply) {
    const tenantId = req.tenantId;
    const { id } = req.params;
    try {
      const optOut = await service.revokeOptOut(tenantId, id);

      return reply.send({ success: true, data: optOut, message: 'Opt-out revoked' });
    } catch (err) {
      logger.error({ err, id, tenantId }, '[NOTIFICATION] Failed to revoke opt-out');
      return reply.code(500).send({ success: false, error: 'Failed to revoke opt-out' });
    }
  }

  // ── GET /api/settings/notifications/opt-outs ──
  async getOptOuts(req, reply) {
    const tenantId = req.tenantId;
    try {
      const { patientId, phoneNumber, channel } = req.query;

      const optOuts = await service.getOptOuts(tenantId, { patientId, phoneNumber, channel });

      return reply.send({ success: true, data: optOuts });
    } catch (err) {
      logger.error({ err, tenantId }, '[NOTIFICATION] Failed to retrieve opt-outs');
      return reply.code(500).send({ success: false, error: 'Failed to retrieve opt-outs' });
    }
  }

  // ── GET /api/settings/notifications/retries ──
  async getRetries(req, reply) {
    const tenantId = req.tenantId;
    try {
      const { type = 'pending' } = req.query;

      const data =
        type === 'dlq'
          ? await service.getDLQEntries(tenantId)
          : await service.getPendingRetries(tenantId);

      return reply.send({ success: true, data });
    } catch (err) {
      logger.error({ err, tenantId }, '[NOTIFICATION] Failed to retrieve retry logs');
      return reply.code(500).send({ success: false, error: 'Failed to retrieve retry logs' });
    }
  }

  // ── POST /api/settings/notifications/retries/:id/recover ──
  async recoverFromDLQ(req, reply) {
    const tenantId = req.tenantId;
    const { id } = req.params;
    try {
      const retryLog = await service.recoverFromDLQ(tenantId, id);

      return reply.send({ success: true, data: retryLog, message: 'Retry recovered from DLQ' });
    } catch (err) {
      logger.error({ err, id, tenantId }, '[NOTIFICATION] Failed to recover from DLQ');
      return reply.code(500).send({ success: false, error: 'Failed to recover from DLQ' });
    }
  }

  // ── POST /api/settings/notifications/test ──
  async testNotification(req, reply) {
    try {
      const tenantId = req.tenantId;
      const validated = testNotificationSchema.parse(req.body);

      const result = await service.testNotification(tenantId, validated);

      if (!result.success) {
        return reply.code(400).send({ success: false, error: result.error });
      }

      return reply.send({ success: true, data: result, message: 'Test notification sent' });
    } catch (err) {
      if (err.errors) {
        return reply
          .code(400)
          .send({ success: false, error: 'Validation failed', details: err.errors });
      }
      return reply.code(500).send({ success: false, error: 'Failed to send test notification' });
    }
  }
}

export default new NotificationSettingsController();
