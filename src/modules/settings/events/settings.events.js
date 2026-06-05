/**
 * Settings event types emitted when settings change.
 * Other modules subscribe to these events to react to configuration changes.
 */
export const SettingsEvents = {
  GST_SETTINGS_UPDATED: 'settings:gst:updated',
  GST_CATEGORY_ADDED: 'settings:gst:category_added',
  GST_CATEGORY_REMOVED: 'settings:gst:category_removed',
  GST_VERSION_CREATED: 'settings:gst:version_created',
  TAX_POLICY_CHANGED: 'settings:tax:policy_changed',
  BILLING_SETTINGS_UPDATED: 'settings:billing:updated',
  INVENTORY_SETTINGS_UPDATED: 'settings:inventory:updated',
  NOTIFICATION_SETTINGS_UPDATED: 'settings:notifications:updated',
  SECURITY_SETTINGS_UPDATED: 'settings:security:updated',
  INVOICE_TEMPLATE_UPDATED: 'settings:invoice_template:updated',
  STORE_PROFILE_UPDATED: 'settings:store_profile:updated',
  ALERT_THRESHOLDS_UPDATED: 'settings:alert_thresholds:updated',
  INTEGRATIONS_UPDATED: 'settings:integrations:updated',
  SETTINGS_APPROVAL_REQUESTED: 'settings:approval:requested',
  SETTINGS_APPROVAL_APPROVED: 'settings:approval:approved',
  SETTINGS_APPROVAL_REJECTED: 'settings:approval:rejected',
  SETTINGS_CACHE_INVALIDATED: 'settings:cache:invalidated',
  SETTINGS_AUDIT_LOG_CREATED: 'settings:audit:log_created',
};

/**
 * Simple event emitter for settings changes.
 * Uses Node.js EventEmitter pattern via the shared event system.
 */
class SettingsEventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      this.listeners.set(
        event,
        callbacks.filter((cb) => cb !== callback),
      );
    }
  }

  async emit(event, payload) {
    const callbacks = this.listeners.get(event) || [];
    for (const callback of callbacks) {
      try {
        await callback(payload);
      } catch (error) {
        console.error(`[SettingsEvent] Error in listener for ${event}:`, error.message);
      }
    }
  }
}

export const settingsEventEmitter = new SettingsEventEmitter();
