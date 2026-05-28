import { localEventBus } from '../../../shared/events/local-event-bus.js';

export const NotificationSettingsEvents = {
  NOTIFICATION_SETTINGS_UPDATED: 'notification:settings:updated',
  CHANNEL_ENABLED: 'notification:channel:enabled',
  CHANNEL_DISABLED: 'notification:channel:disabled',
  ESCALATION_POLICY_CHANGED: 'notification:escalation:changed',
  REMINDER_RULE_UPDATED: 'notification:reminder:updated',
  OPT_OUT_CREATED: 'notification:optout:created',
  OPT_OUT_REVOKED: 'notification:optout:revoked',
  THROTTLING_TRIGGERED: 'notification:throttling:triggered',
  DLQ_ENTRY_CREATED: 'notification:dlq:entry',
  RETRY_SCHEDULED: 'notification:retry:scheduled',
};

export const notificationSettingsEventEmitter = {
  async emit(event, payload) {
    localEventBus.emit(event, payload);
  },

  on(event, handler) {
    localEventBus.on(event, handler);
  },

  off(event, handler) {
    localEventBus.off(event, handler);
  },
};
