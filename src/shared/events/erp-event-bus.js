import { Queue } from 'bullmq';
import { getBullRedis } from '../../config/redis.js';
import { registerQueue } from '../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

let erpEventBusInstance = null;

if (!isTest) {
  erpEventBusInstance = registerQueue(
    new Queue('erp-events', {
      connection: getBullRedis(),
    }),
  );
}

export const erpEventBus = erpEventBusInstance;

export const emitEvent = async (eventName, data) => {
  if (!erpEventBusInstance) {
    // In test mode, silently skip — no queue available
    return;
  }
  const { sanitizeRedisPayload } = await import('../utils/sanitize-redis-payload.js');
  const safeData = sanitizeRedisPayload(data);
  await erpEventBusInstance.add(eventName, safeData, {
    removeOnComplete: true,
  });
};
