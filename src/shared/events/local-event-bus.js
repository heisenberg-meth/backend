import { EventEmitter } from 'events';

/**
 * Synchronous Event Emitter for in-process orchestration.
 * Use this for things that must happen immediately or within the same lifecycle.
 */
class LocalEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }
}

export const localEventBus = new LocalEventBus();

import { sanitizeRedisPayload } from '../utils/sanitize-redis-payload.js';

/**
 * Domain Event wrapper to ensure consistency
 */
export const emitLocalEvent = (event, data) => {
  const safeData = sanitizeRedisPayload(data);
  localEventBus.emit(event, safeData);
};
