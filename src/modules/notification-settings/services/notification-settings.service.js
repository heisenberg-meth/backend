import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import repo from '../repositories/notification-settings.repository.js';
import {
  notificationSettingsEventEmitter,
  NotificationSettingsEvents,
} from '../events/notification-settings.events.js';
import auditService from '../../audit/service/audit.service.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';

const DEFAULT_SETTINGS = {
  smsEnabled: true,
  whatsappEnabled: true,
  emailEnabled: true,
  inAppEnabled: true,
  pushEnabled: false,
  alertEmail: null,
  refillReminderDaysBefore: 3,
  appointmentReminderHoursBefore: 24,
  expiryReminderDaysBefore: 7,
  maxRetries: 5,
  cooldownMinutes: 30,
  retryBackoffStrategy: 'exponential',
  criticalEscalationEnabled: true,
  escalationTimeoutMinutes: 30,
  maxEscalationLevels: 3,
  maxNotificationsPerHour: 100,
  maxRemindersPerDay: 5,
  duplicateSuppressionMinutes: 60,
  respectOptOuts: true,
  consentRequired: false,
  defaultFallbackChannel: 'email',
};

class NotificationSettingsService {
  // ── Core Settings ──

  async getSettings(tenantId, branchId = null) {
    let settings = await repo.getByTenantAndBranch(tenantId, branchId);

    if (!settings) {
      settings = await repo.upsert(tenantId, DEFAULT_SETTINGS, branchId);
    }

    return this._sanitizeSettings(settings);
  }

  async updateSettings(tenantId, data, updatedBy = null, branchId = null) {
    const validated = this._validateSettings(data);

    // Channel Dependency Validation
    await this._validateChannelDependencies(tenantId, validated);

    const oldSettings = await repo.getByTenantAndBranch(tenantId, branchId);

    const settings = await repo.upsert(
      tenantId,
      {
        ...validated,
        ...(updatedBy ? { updatedBy } : {}),
      },
      branchId,
    );

    await this._invalidateCache(tenantId, branchId);

    // Audit logging
    await auditService.logAction({
      tenantId,
      userId: updatedBy,
      entityType: 'NOTIFICATION_SETTINGS',
      entityId: settings?.id,
      action: 'UPDATE',
      previousData: oldSettings,
      newData: settings,
    });

    await notificationSettingsEventEmitter.emit(
      NotificationSettingsEvents.NOTIFICATION_SETTINGS_UPDATED,
      { tenantId, branchId, updatedBy, changes: validated },
    );

    logger.info(
      { tenantId, branchId, updatedBy, changes: Object.keys(validated) },
      'Notification settings updated',
    );

    return this._sanitizeSettings(settings);
  }

  // ── Channel Configs ──

  async getChannelConfigs(tenantId, channelType = null) {
    return repo.getChannelConfigs(tenantId, channelType);
  }

  async upsertChannelConfig(tenantId, data) {
    const oldConfig = await repo
      .getChannelConfigs(tenantId, data.channelType)
      .then((configs) => configs.find((c) => c.providerName === data.providerName));

    const config = await repo.upsertChannelConfig(tenantId, data);

    await this._invalidateCache(tenantId);

    // Audit logging
    await auditService.logAction({
      tenantId,
      entityType: 'NOTIFICATION_CHANNEL_CONFIG',
      entityId: config.id,
      action: oldConfig ? 'UPDATE' : 'CREATE',
      previousData: oldConfig,
      newData: config,
    });

    const event = data.isActive
      ? NotificationSettingsEvents.CHANNEL_ENABLED
      : NotificationSettingsEvents.CHANNEL_DISABLED;

    await notificationSettingsEventEmitter.emit(event, {
      tenantId,
      channelType: data.channelType,
      providerName: data.providerName,
    });

    return config;
  }

  async deleteChannelConfig(tenantId, channelConfigId) {
    const config = await repo.deleteChannelConfig(tenantId, channelConfigId);
    await this._invalidateCache(tenantId);
    return config;
  }

  async recordChannelDelivery(tenantId, channelConfigId, success) {
    return repo.recordChannelDelivery(tenantId, channelConfigId, success);
  }

  // ── Escalation Policies ──

  async getEscalationPolicies(tenantId, triggerType = null) {
    return repo.getEscalationPolicies(tenantId, triggerType);
  }

  async createEscalationPolicy(tenantId, data) {
    this._validateEscalationChain(data.escalationChain);

    const policy = await repo.createEscalationPolicy(tenantId, {
      ...data,
      triggerCondition: data.triggerCondition || {},
    });

    await notificationSettingsEventEmitter.emit(
      NotificationSettingsEvents.ESCALATION_POLICY_CHANGED,
      { tenantId, policyId: policy.id, action: 'created' },
    );

    return policy;
  }

  async updateEscalationPolicy(tenantId, policyId, data) {
    if (data.escalationChain) {
      this._validateEscalationChain(data.escalationChain);
    }

    const policy = await repo.updateEscalationPolicy(tenantId, policyId, data);

    await notificationSettingsEventEmitter.emit(
      NotificationSettingsEvents.ESCALATION_POLICY_CHANGED,
      { tenantId, policyId, action: 'updated' },
    );

    return policy;
  }

  async deleteEscalationPolicy(tenantId, policyId) {
    await repo.deleteEscalationPolicy(tenantId, policyId);

    await notificationSettingsEventEmitter.emit(
      NotificationSettingsEvents.ESCALATION_POLICY_CHANGED,
      { tenantId, policyId, action: 'deleted' },
    );
  }

  // ── Reminder Rules ──

  async getReminderRules(tenantId, reminderType = null) {
    return repo.getReminderRules(tenantId, reminderType);
  }

  async createReminderRule(tenantId, data) {
    const rule = await repo.createReminderRule(tenantId, data);

    await notificationSettingsEventEmitter.emit(NotificationSettingsEvents.REMINDER_RULE_UPDATED, {
      tenantId,
      ruleId: rule.id,
      action: 'created',
      reminderType: data.reminderType,
    });

    return rule;
  }

  async updateReminderRule(tenantId, ruleId, data) {
    const rule = await repo.updateReminderRule(tenantId, ruleId, data);

    await notificationSettingsEventEmitter.emit(NotificationSettingsEvents.REMINDER_RULE_UPDATED, {
      tenantId,
      ruleId,
      action: 'updated',
    });

    return rule;
  }

  async deleteReminderRule(tenantId, ruleId) {
    await repo.deleteReminderRule(tenantId, ruleId);

    await notificationSettingsEventEmitter.emit(NotificationSettingsEvents.REMINDER_RULE_UPDATED, {
      tenantId,
      ruleId,
      action: 'deleted',
    });
  }

  // ── Compliance: Opt-Outs ──

  async createOptOut(tenantId, data, optedOutBy = 'patient') {
    const optOut = await repo.createOptOut(tenantId, {
      ...data,
      optedOutBy,
    });

    await notificationSettingsEventEmitter.emit(NotificationSettingsEvents.OPT_OUT_CREATED, {
      tenantId,
      optOutId: optOut.id,
    });

    return optOut;
  }

  async revokeOptOut(tenantId, optOutId) {
    const optOut = await repo.revokeOptOut(tenantId, optOutId);

    await notificationSettingsEventEmitter.emit(NotificationSettingsEvents.OPT_OUT_REVOKED, {
      tenantId,
      optOutId,
    });

    return optOut;
  }

  async checkOptOut(tenantId, { phoneNumber, email, channel, reminderType }) {
    const settings = await this.getSettings(tenantId);
    if (!settings.respectOptOuts) return false;

    const optOut = await repo.checkOptOut(tenantId, {
      phoneNumber,
      email,
      channel,
      reminderType,
    });

    return !!optOut;
  }

  async getOptOuts(tenantId, filters = {}) {
    return repo.getOptOuts(tenantId, filters);
  }

  // ── Throttling (Redis-based) ──

  async checkThrottle(tenantId, channel = 'all') {
    const settings = await this.getSettings(tenantId);

    // Hourly rate check
    const hourlyKey = `notif:throttle:hourly:${tenantId}:${channel}`;
    const hourlyCount = await redisClient.incr(hourlyKey);
    await redisClient.expire(hourlyKey, 3600);

    if (hourlyCount > settings.maxNotificationsPerHour) {
      await notificationSettingsEventEmitter.emit(NotificationSettingsEvents.THROTTLING_TRIGGERED, {
        tenantId,
        channel,
        reason: 'hourly_limit',
        count: hourlyCount,
        limit: settings.maxNotificationsPerHour,
      });
      return { allowed: false, reason: 'hourly_limit_exceeded', retryAfter: 3600 };
    }

    return { allowed: true, hourlyCount };
  }

  async checkDuplicateSuppression(tenantId, fingerprint) {
    const settings = await this.getSettings(tenantId);
    const key = `notif:dedup:${tenantId}:${fingerprint}`;
    const exists = await redisClient.get(key);

    if (exists) {
      return { suppressed: true, reason: 'duplicate_suppression' };
    }

    await redisClient.set(key, '1', 'EX', settings.duplicateSuppressionMinutes * 60);
    return { suppressed: false };
  }

  // ── Retry Infrastructure ──

  async scheduleRetry(tenantId, data) {
    const settings = await this.getSettings(tenantId);
    const retryAttempt = data.retryAttempt || 0;

    if (retryAttempt >= settings.maxRetries) {
      // Move to DLQ
      const retryLog = await repo.createRetryLog(tenantId, {
        ...data,
        retryAttempt,
        status: 'dlq',
        movedToDLQAt: new Date(),
        dlqReason: `Max retries (${settings.maxRetries}) exhausted`,
      });

      await notificationSettingsEventEmitter.emit(NotificationSettingsEvents.DLQ_ENTRY_CREATED, {
        tenantId,
        retryLogId: retryLog.id,
        notificationId: data.notificationId,
      });

      return { status: 'dlq', retryLog };
    }

    // Calculate next retry time based on backoff strategy
    const nextRetryAt = this._calculateNextRetry(settings, retryAttempt);

    const retryLog = await repo.createRetryLog(tenantId, {
      ...data,
      retryAttempt,
      status: 'retrying',
      nextRetryAt,
    });

    await notificationSettingsEventEmitter.emit(NotificationSettingsEvents.RETRY_SCHEDULED, {
      tenantId,
      retryLogId: retryLog.id,
      nextRetryAt,
      attempt: retryAttempt + 1,
    });

    return { status: 'scheduled', retryLog, nextRetryAt };
  }

  async getPendingRetries(tenantId) {
    return repo.getPendingRetries(tenantId);
  }

  async getDLQEntries(tenantId) {
    return repo.getDLQEntries(tenantId);
  }

  async recoverFromDLQ(tenantId, retryLogId) {
    const settings = await this.getSettings(tenantId);
    const nextRetryAt = this._calculateNextRetry(settings, 0);

    return repo.updateRetryLog(tenantId, retryLogId, {
      status: 'pending',
      nextRetryAt,
      movedToDLQAt: null,
      dlqReason: null,
    });
  }

  // ── Channel Resolution (with fallback) ──

  async resolveChannel(tenantId, preferredChannel, { phoneNumber, email }) {
    const settings = await this.getSettings(tenantId);
    const channelMap = {
      sms: { enabled: settings.smsEnabled, contact: phoneNumber },
      whatsapp: { enabled: settings.whatsappEnabled, contact: phoneNumber },
      email: { enabled: settings.emailEnabled, contact: email },
      in_app: { enabled: settings.inAppEnabled, contact: null },
      push: { enabled: settings.pushEnabled, contact: null },
    };

    // Try preferred channel first
    const preferred = channelMap[preferredChannel];
    if (preferred?.enabled && preferred?.contact) {
      // Check opt-out
      const isOptedOut = await this.checkOptOut(tenantId, {
        phoneNumber,
        email,
        channel: preferredChannel.toUpperCase(),
      });
      if (!isOptedOut) {
        return { channel: preferredChannel, contact: preferred.contact };
      }
    }

    // Fallback to default
    const fallback = settings.defaultFallbackChannel;
    const fallbackInfo = channelMap[fallback];
    if (fallbackInfo?.enabled && fallbackInfo?.contact) {
      const isOptedOut = await this.checkOptOut(tenantId, {
        phoneNumber,
        email,
        channel: fallback.toUpperCase(),
      });
      if (!isOptedOut) {
        return { channel: fallback, contact: fallbackInfo.contact, fallback: true };
      }
    }

    // Last resort: in_app (no contact needed)
    if (settings.inAppEnabled) {
      return { channel: 'in_app', contact: null, fallback: true };
    }

    return { channel: null, contact: null, error: 'no_available_channel' };
  }

  // ── Test Notification ──

  async testNotification(tenantId, { channel, recipient, message }) {
    const settings = await this.getSettings(tenantId);
    const channelEnabled = {
      sms: settings.smsEnabled,
      whatsapp: settings.whatsappEnabled,
      email: settings.emailEnabled,
      in_app: settings.inAppEnabled,
    };

    if (!channelEnabled[channel]) {
      return { success: false, error: `${channel} channel is disabled` };
    }

    // In production, this would send an actual test notification
    // For now, validate and return success
    return {
      success: true,
      channel,
      recipient,
      message: message || `Test notification from Viyan MedAssist at ${new Date().toISOString()}`,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Private Helpers ──

  async _validateChannelDependencies(tenantId, data) {
    const channelsToCheck = [
      { key: 'smsEnabled', type: 'SMS' },
      { key: 'whatsappEnabled', type: 'WHATSAPP' },
      { key: 'emailEnabled', type: 'EMAIL' },
      { key: 'pushEnabled', type: 'PUSH' },
    ];

    for (const { key, type } of channelsToCheck) {
      if (data[key] === true) {
        const configs = await repo.getChannelConfigs(tenantId, type);
        const activeConfig = configs.find((c) => c.isActive);
        if (!activeConfig) {
          logger.warn(
            { tenantId, type },
            `${type} channel enabled without an active provider configuration. Notifications will not be sent until configured.`,
          );
        }
      }
    }
  }

  _validateSettings(data) {
    const validated = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (key in DEFAULT_SETTINGS) {
        validated[key] = value;
      }
    }
    return validated;
  }

  _validateEscalationChain(chain) {
    if (!Array.isArray(chain) || chain.length === 0) {
      throw new Error('Escalation chain must be a non-empty array');
    }

    const levels = new Set();
    for (const step of chain) {
      if (levels.has(step.level)) {
        throw new Error(`Duplicate escalation level: ${step.level}`);
      }
      levels.add(step.level);

      if (!step.role || !step.channels || step.channels.length === 0) {
        throw new Error(`Escalation level ${step.level} missing role or channels`);
      }
    }
  }

  _calculateNextRetry(settings, retryAttempt) {
    const baseDelay = settings.cooldownMinutes * 60 * 1000;
    let delay;

    switch (settings.retryBackoffStrategy) {
      case 'exponential':
        delay = baseDelay * Math.pow(2, retryAttempt);
        break;
      case 'linear':
        delay = baseDelay * (retryAttempt + 1);
        break;
      case 'fixed':
      default:
        delay = baseDelay;
        break;
    }

    // Cap at 24 hours
    delay = Math.min(delay, 24 * 60 * 60 * 1000);

    return new Date(Date.now() + delay);
  }

  _sanitizeSettings(settings) {
    if (!settings) return null;
    const { channelConfigs, escalationPolicies, reminderRules, ...core } = settings;
    return {
      ...core,
      channels: {
        sms: settings.smsEnabled,
        whatsapp: settings.whatsappEnabled,
        email: settings.emailEnabled,
        inApp: settings.inAppEnabled,
        push: settings.pushEnabled,
      },
      alertEmail: settings.alertEmail,
      channelConfigs: channelConfigs || [],
      escalationPolicies: escalationPolicies || [],
      reminderRules: reminderRules || [],
    };
  }

  async _invalidateCache(tenantId, branchId = null) {
    try {
      const pattern = branchId
        ? `notif:settings:${tenantId}:${branchId}*`
        : `notif:settings:${tenantId}:*`;
      const keys = await scanKeys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (err) {
      logger.warn({ err }, 'Notification settings cache invalidation failed');
    }
  }
}

export default new NotificationSettingsService();
