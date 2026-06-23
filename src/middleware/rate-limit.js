import redis from '../config/redis.js';
import logger from '../shared/utils/logger.js';

const RATE_LIMIT_PREFIX = 'rl:';

/**
 * Redis-based rate limiter
 * Persists across server restarts
 */
export const rateLimiter = (options = {}) => {
  const {
    maxRequests = 100,
    windowMs = 60 * 1000,
    message = 'Too many requests, please try again later',
    keyGenerator = (request) => request.ip,
  } = options;

  const windowSeconds = Math.ceil(windowMs / 1000);

  return async (request, reply) => {
    const key = `${RATE_LIMIT_PREFIX}${keyGenerator(request)}`;

    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }

      const ttl = await redis.ttl(key);
      const remaining = Math.max(0, maxRequests - current);

      reply.header('X-RateLimit-Limit', maxRequests);
      reply.header('X-RateLimit-Remaining', remaining);
      reply.header('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + ttl);

      if (current > maxRequests) {
        return reply.code(429).send({
          success: false,
          error: {
            message,
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: ttl,
          },
        });
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Redis rate limiter failed, allowing request');
      // Fail open — allow request if Redis is down
    }
  };
};

/**
 * Strict rate limiter for auth endpoints
 */
export const authRateLimiter = rateLimiter({
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
  message: 'Too many login attempts, please try again in 15 minutes',
});

/**
 * Standard API rate limiter
 */
export const apiRateLimiter = rateLimiter({
  maxRequests: 100,
  windowMs: 60 * 1000,
  message: 'Too many API requests, please try again later',
});

/**
 * Strict rate limiter for sensitive operations
 */
export const strictRateLimiter = rateLimiter({
  maxRequests: 5,
  windowMs: 60 * 60 * 1000,
  message: 'Too many attempts, please try again in 1 hour',
});

export default {
  rateLimiter,
  authRateLimiter,
  apiRateLimiter,
  strictRateLimiter,
};
