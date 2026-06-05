import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';

const LOCK_PREFIX = 'payment:lock:';
const DEFAULT_TTL = 30000;

class PaymentLockService {
  async acquireLock(resourceId, ttlMs = DEFAULT_TTL) {
    const lockKey = `${LOCK_PREFIX}${resourceId}`;
    const lockValue = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      const acquired = await redisClient.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
      if (acquired === 'OK') {
        logger.debug({ resourceId, lockValue, ttlMs }, '[LOCK] Acquired');
        return lockValue;
      }
      logger.debug({ resourceId }, '[LOCK] Busy');
      return null;
    } catch (error) {
      logger.error({ error, resourceId }, '[LOCK] Acquire error');
      return null;
    }
  }

  async releaseLock(resourceId, lockValue) {
    const lockKey = `${LOCK_PREFIX}${resourceId}`;

    try {
      const current = await redisClient.get(lockKey);
      if (current === lockValue) {
        await redisClient.del(lockKey);
        logger.debug({ resourceId }, '[LOCK] Released');
        return true;
      }
      logger.warn(
        { resourceId, expected: lockValue, actual: current },
        '[LOCK] Release failed - not owner',
      );
      return false;
    } catch (error) {
      logger.error({ error, resourceId }, '[LOCK] Release error');
      return false;
    }
  }

  async executeWithLock(resourceId, fn, ttlMs = DEFAULT_TTL) {
    const lockValue = await this.acquireLock(resourceId, ttlMs);
    if (!lockValue) {
      throw new Error(`Resource locked: ${resourceId}`);
    }

    try {
      const result = await fn();
      return result;
    } finally {
      await this.releaseLock(resourceId, lockValue);
    }
  }

  async extendLock(resourceId, lockValue, ttlMs = DEFAULT_TTL) {
    const lockKey = `${LOCK_PREFIX}${resourceId}`;
    try {
      const current = await redisClient.get(lockKey);
      if (current === lockValue) {
        await redisClient.pexpire(lockKey, ttlMs);
        return true;
      }
      return false;
    } catch (error) {
      logger.error({ error, resourceId }, '[LOCK] Extend error');
      return false;
    }
  }
}

export default new PaymentLockService();
