import { Queue } from 'bullmq';
import { getBullRedis } from '../../config/redis.js';
import { registerQueue } from '../../config/queue-registry.js';
import logger from '../../shared/utils/logger.js';

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
  
  // Debug logging to catch serialization issues
  try {
    JSON.stringify(safeData);
  } catch (jsonErr) {
    logger.error({ eventName, data, jsonErr: jsonErr.message }, 'JSON serialization failed before queue add');
    throw jsonErr;
  }
  
  try {
    await erpEventBusInstance.add(eventName, safeData, {
      removeOnComplete: true,
    });
  } catch (queueErr) {
    logger.error(
      { 
        eventName, 
        safeData: JSON.stringify(safeData).substring(0, 500),
        queueErr: queueErr.message,
        queueErrStack: queueErr.stack
      }, 
      'BullMQ queue.add failed - likely Redis argument type error'
    );
    throw queueErr;
  }
};
