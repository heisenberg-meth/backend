export const StoreProfileEvents = {
  STORE_PROFILE_CREATED: 'store_profile:created',
  STORE_PROFILE_UPDATED: 'store_profile:updated',
  STORE_PROFILE_VERSIONED: 'store_profile:versioned',
  GSTIN_CHANGED: 'store_profile:gstin_changed',
  DRUG_LICENSE_UPDATED: 'store_profile:drug_license_updated',
  BRANDING_UPDATED: 'store_profile:branding_updated',
  DOCUMENT_UPLOADED: 'store_profile:document_uploaded',
  DOCUMENT_VERIFIED: 'store_profile:document_verified',
  LOCALIZATION_UPDATED: 'store_profile:localization_updated',
  CACHE_INVALIDATED: 'store_profile:cache_invalidated',
  COMPLIANCE_ALERT: 'store_profile:compliance_alert',
};

class StoreProfileEventEmitter {
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
        console.error(`[StoreProfileEvent] Error in listener for ${event}:`, error.message);
      }
    }
  }
}

export const storeProfileEventEmitter = new StoreProfileEventEmitter();
