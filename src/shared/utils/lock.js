import { initRedis } from '../../config/redis.js';

const redisClient = initRedis();

/**
 * Acquire a distributed lock using Redis
 * @param {string} resource Name of the resource to lock
 * @param {number} ttlMs Time to live for the lock in milliseconds
 * @returns {Promise<boolean>} True if lock was acquired
 */
export const acquireLock = async (resource, ttlMs = 5000) => {
  const lockKey = `lock:${resource}`;
  const result = await redisClient.set(lockKey, 'locked', 'PX', ttlMs, 'NX');
  return result === 'OK';
};

/**
 * Release a distributed lock
 * @param {string} resource Name of the resource to unlock
 */
export const releaseLock = async (resource) => {
  const lockKey = `lock:${resource}`;
  await redisClient.del(lockKey);
};
