import crypto from 'crypto';
import { initRedis } from '../../config/redis.js';
import logger from './logger.js';

const redisClient = initRedis();

// Internal map of currently held lock tokens by resource for process-local ownership tracking
const activeLockTokens = new Map();

const EXTEND_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], tonumber(ARGV[2]))
else
  return 0
end
`;

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Acquire an ownership-safe distributed lock using Redis.
 * Stores a unique token to guarantee that subsequent extensions or releases
 * can only operate on locks owned by the current process.
 *
 * @param {string} resource Name of the resource to lock
 * @param {number} ttlMs Time to live for the lock in milliseconds
 * @param {string|null} customToken Optional custom token (defaults to a random UUID)
 * @returns {Promise<boolean>} True if lock was acquired
 */
export const acquireLock = async (resource, ttlMs = 5000, customToken = null) => {
  const lockKey = `lock:${resource}`;
  const token = customToken || crypto.randomUUID();
  const result = await redisClient.set(lockKey, token, 'PX', ttlMs, 'NX');

  if (result === 'OK') {
    activeLockTokens.set(resource, token);
    return true;
  }

  return false;
};

/**
 * Extend TTL for an existing lock only if the ownership token matches.
 * Uses atomic Redis Lua script to prevent extending a lock that expired
 * and was subsequently acquired by another process.
 *
 * @param {string} resource Name of the resource to extend
 * @param {number} ttlMs New TTL in milliseconds
 * @param {string|null} customToken Optional custom token
 * @returns {Promise<boolean>} True if lock was extended
 */
export const extendLock = async (resource, ttlMs = 5000, customToken = null) => {
  const lockKey = `lock:${resource}`;
  const token = customToken || activeLockTokens.get(resource);

  if (!token) {
    return false;
  }

  if (typeof redisClient.eval !== 'function') {
    return false;
  }

  const result = await redisClient.eval(EXTEND_LOCK_SCRIPT, 1, lockKey, token, ttlMs);
  const success = result === 1;
  if (!success) {
    activeLockTokens.delete(resource);
  }
  return success;
};

/**
 * Starts a background heartbeat timer to automatically renew a lock until stopped.
 * Guarantees long-running operations (such as large imports or bulk inventory clearing)
 * do not lose their lock prematurely.
 * If lock ownership is lost, the heartbeat automatically halts.
 *
 * @param {string} resource Name of the resource being renewed
 * @param {number} ttlMs The lock TTL in milliseconds
 * @param {number|null} intervalMs Heartbeat interval (defaults to ttlMs / 2)
 * @param {string|null} customToken Optional custom token
 * @returns {() => void} Function to stop the heartbeat
 */
export const startLockHeartbeat = (
  resource,
  ttlMs = 30000,
  intervalMs = null,
  customToken = null,
) => {
  const token = customToken || activeLockTokens.get(resource);
  const interval = intervalMs || Math.max(1000, Math.floor(ttlMs / 2));

  const timer = setInterval(async () => {
    try {
      const extended = await extendLock(resource, ttlMs, token);
      if (!extended) {
        clearInterval(timer);
      }
    } catch (err) {
      logger.error(err);
    }
  }, interval);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return () => clearInterval(timer);
};

/**
 * Release a distributed lock safely using an atomic Lua script.
 * Only deletes the key if its value equals the ownership token, preventing
 * accidental deletion of locks acquired by another process after expiration.
 *
 * @param {string} resource Name of the resource to unlock
 * @param {string|null} customToken Optional custom token
 * @returns {Promise<boolean>}
 */
export const releaseLock = async (resource, customToken = null) => {
  const lockKey = `lock:${resource}`;
  const token = customToken || activeLockTokens.get(resource);
  activeLockTokens.delete(resource);

  if (!token) {
    return false;
  }

  if (typeof redisClient.eval !== 'function') {
    return false;
  }

  const result = await redisClient.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, token);
  return result === 1;
};

/**
 * Gets the current active lock token for a resource held by this process.
 * @param {string} resource
 * @returns {string|null}
 */
export const getLockToken = (resource) => activeLockTokens.get(resource) || null;
