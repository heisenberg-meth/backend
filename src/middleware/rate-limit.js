/**
 * Rate Limiting Middleware
 * Protects against brute force attacks and API abuse
 */

const rateLimitStore = new Map();

/**
 * Simple in-memory rate limiter
 * In production, use Redis-based rate limiting
 */
export const rateLimiter = (options = {}) => {
  const {
    maxRequests = 100,
    windowMs = 60 * 1000, // 1 minute
    message = 'Too many requests, please try again later',
    keyGenerator = (request) => request.ip,
  } = options;

  return async (request, reply) => {
    const key = keyGenerator(request);
    const now = Date.now();

    // Get or create rate limit entry
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 0, resetAt: now + windowMs });
    }

    const entry = rateLimitStore.get(key);

    // Reset if window has passed
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }

    entry.count++;

    // Set rate limit headers
    reply.header('X-RateLimit-Limit', maxRequests);
    reply.header('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));
    reply.header('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > maxRequests) {
      return reply.code(429).send({
        success: false,
        error: {
          message,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((entry.resetAt - now) / 1000),
        },
      });
    }
  };
};

/**
 * Strict rate limiter for auth endpoints
 */
export const authRateLimiter = rateLimiter({
  maxRequests: 10,
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: 'Too many login attempts, please try again in 15 minutes',
});

/**
 * Standard API rate limiter
 */
export const apiRateLimiter = rateLimiter({
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many API requests, please try again later',
});

/**
 * Strict rate limiter for sensitive operations
 */
export const strictRateLimiter = rateLimiter({
  maxRequests: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many attempts, please try again in 1 hour',
});

/**
 * Cleanup old entries periodically
 */
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  },
  5 * 60 * 1000,
); // Cleanup every 5 minutes

export default {
  rateLimiter,
  authRateLimiter,
  apiRateLimiter,
  strictRateLimiter,
};
