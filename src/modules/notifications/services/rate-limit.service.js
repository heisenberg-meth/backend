import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';

const RATE_LIMITS = {
  sms: { max: 5, windowSeconds: 60 },
  whatsapp: { max: 10, windowSeconds: 60 },
  email: { max: 20, windowSeconds: 60 },
};

class NotificationRateLimitService {
  async checkRateLimit(tenantId, channel, recipient) {
    const limits = RATE_LIMITS[channel.toLowerCase()] || RATE_LIMITS.email;
    const { max, windowSeconds } = limits;

    const rateKey = `notification:ratelimit:${tenantId}:${channel}:${recipient}`;
    const current = await redisClient.incr(rateKey);

    if (current === 1) {
      await redisClient.expire(rateKey, windowSeconds);
    }

    if (current > max) {
      logger.warn(
        { tenantId, channel, recipient, current, max },
        '[RATE-LIMIT] Notification rate limit exceeded'
      );
      return { allowed: false, current, max, retryAfter: windowSeconds };
    }

    return { allowed: true, current, max };
  }

  async resetRateLimit(tenantId, channel, recipient) {
    const rateKey = `notification:ratelimit:${tenantId}:${channel}:${recipient}`;
    await redisClient.del(rateKey);
  }

  async getRateLimitStatus(tenantId, channel, recipient) {
    const limits = RATE_LIMITS[channel.toLowerCase()] || RATE_LIMITS.email;
    const rateKey = `notification:ratelimit:${tenantId}:${channel}:${recipient}`;
    const current = await redisClient.get(rateKey);

    return {
      channel,
      current: parseInt(current || '0', 10),
      max: limits.max,
      windowSeconds: limits.windowSeconds,
    };
  }
}

export default new NotificationRateLimitService();
