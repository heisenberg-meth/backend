import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';

const HOURLY_LIMITS = {
  SMS: 50,
  WHATSAPP: 100,
  EMAIL: 200,
};

class NotificationThrottlingService {
  async checkHourlyThrottle(tenantId, channel) {
    const limits = HOURLY_LIMITS[channel] || HOURLY_LIMITS.EMAIL;
    const key = `notif:throttle:hourly:${tenantId}:${channel}`;
    const windowSeconds = 3600;

    const current = await redisClient.incr(key);
    if (current === 1) {
      await redisClient.expire(key, windowSeconds);
    }

    if (current > limits) {
      logger.warn({ tenantId, channel, current, limits }, '[Throttle] Hourly notification limit reached');
      return { allowed: false, current, limit: limits, retryAfter: windowSeconds };
    }

    return { allowed: true, current, limit: limits };
  }

  async getThrottleStatus(tenantId, channel) {
    const key = `notif:throttle:hourly:${tenantId}:${channel}`;
    const current = await redisClient.get(key);
    return {
      channel,
      current: parseInt(current || '0', 10),
      limit: HOURLY_LIMITS[channel] || HOURLY_LIMITS.EMAIL,
    };
  }
}

export default new NotificationThrottlingService();
