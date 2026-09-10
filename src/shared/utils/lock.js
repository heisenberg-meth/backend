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
 * Extend TTL for an existing lock
 * @param {string} resource Name of the resource to extend
 * @param {number} ttlMs New TTL in milliseconds
 * @returns {Promise<boolean>} True if lock was extended
 */
export const extendLock = async (resource, ttlMs = 5000) => {
  const lockKey = `lock:${resource}`;
  const result = await redisClient.pexpire(lockKey, ttlMs);
  return result === 1;
};

/**
 * Starts a background heartbeat timer to automatically renew a lock until stopped.
 * Guarantees long-running operations (such as large imports or bulk inventory clearing)
 * do not lose their lock prematurely.
 *
 * @param {string} resource Name of the resource being renewed
 * @param {number} ttlMs The lock TTL in milliseconds
 * @param {number|null} intervalMs Heartbeat interval (defaults to ttlMs / 2)
 * @returns {() => void} Function to stop the heartbeat
 */
export const startLockHeartbeat = (resource, ttlMs = 30000, intervalMs = null) => {
  const interval = intervalMs || Math.max(1000, Math.floor(ttlMs / 2));
  const timer = setInterval(async () => {
    try {
      await extendLock(resource, ttlMs);
    } catch {
      // transient redis errors during renewal shouldn't crash
    }
  }, interval);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return () => clearInterval(timer);
};

/**
 * Release a distributed lock
 * @param {string} resource Name of the resource to unlock
 */
export const releaseLock = async (resource) => {
  const lockKey = `lock:${resource}`;
  await redisClient.del(lockKey);
};
