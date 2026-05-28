export const DashboardEvents = {
  DASHBOARD_CACHE_UPDATED: 'dashboard:cache:updated',
  DASHBOARD_CACHE_INVALIDATED: 'dashboard:cache:invalidated',
  SALES_SUMMARY_REFRESHED: 'dashboard:sales:refreshed',
  INVENTORY_HEALTH_REFRESHED: 'dashboard:inventory:refreshed',
  ALERT_AGGREGATION_COMPLETED: 'dashboard:alerts:aggregated',
  OVERVIEW_REFRESHED: 'dashboard:overview:refreshed',
};

class DashboardEventEmitter {
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
        console.error(`[DashboardEvent] Error in listener for ${event}:`, error.message);
      }
    }
  }
}

export const dashboardEventEmitter = new DashboardEventEmitter();
