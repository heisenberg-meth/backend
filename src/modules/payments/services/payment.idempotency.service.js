import crypto from 'crypto';
import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import paymentLockService from './payment.lock.service.js';

const IDEMPOTENCY_KEY_PREFIX = 'idempotency:';
const RESPONSE_PREFIX = 'idempotency:response:';
const LOCK_TTL = 10000;

class PaymentIdempotencyService {
  generateKey(prefix, data) {
    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    return `${prefix}:${hash}`;
  }

  generatePaymentKey(tenantId, amount, receipt) {
    return this.generateKey('pay', { tenantId, amount, receipt });
  }

  generateWebhookKey(eventId, paymentId) {
    return `webhook:${eventId}:${paymentId}`;
  }

  async isProcessed(idempotencyKey) {
    try {
      const cached = await redisClient.get(`${IDEMPOTENCY_KEY_PREFIX}${idempotencyKey}`);
      if (cached) return JSON.parse(cached);

      const dbRecord = await prisma.paymentIdempotency.findUnique({
        where: { idempotencyKey },
      });
      if (dbRecord) {
        await redisClient.set(
          `${IDEMPOTENCY_KEY_PREFIX}${idempotencyKey}`,
          JSON.stringify(dbRecord.response),
          'EX',
          3600
        );
        return dbRecord.response;
      }
      return null;
    } catch (error) {
      logger.error({ error, idempotencyKey }, '[IDEMPOTENCY] Check error');
      return null;
    }
  }

  async markProcessed(idempotencyKey, response, ttlSeconds = 86400) {
    try {
      await redisClient.set(
        `${RESPONSE_PREFIX}${idempotencyKey}`,
        JSON.stringify(response),
        'EX',
        ttlSeconds
      );

      await prisma.paymentIdempotency.upsert({
        where: { idempotencyKey },
        create: {
          idempotencyKey,
          response,
          expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        },
        update: {
          response,
          expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        },
      });

      logger.debug({ idempotencyKey }, '[IDEMPOTENCY] Marked processed');
      return true;
    } catch (error) {
      logger.error({ error, idempotencyKey }, '[IDEMPOTENCY] Mark error');
      return false;
    }
  }

  async processIdempotent(key, fn, ttlSeconds = 86400) {
    const cached = await this.isProcessed(key);
    if (cached) {
      logger.info({ idempotencyKey: key }, '[IDEMPOTENCY] Replaying cached response');
      return { ...cached, _replayed: true };
    }

    const lockKey = `idem_lock:${key}`;
    return paymentLockService.executeWithLock(lockKey, async () => {
      // Double-check inside lock to prevent race conditions
      const doubleCheck = await this.isProcessed(key);
      if (doubleCheck) {
        return { ...doubleCheck, _replayed: true };
      }

      const result = await fn();
      await this.markProcessed(key, result, ttlSeconds);
      return result;
    }, LOCK_TTL);
  }

  async cleanupExpired() {
    try {
      const result = await prisma.paymentIdempotency.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });
      logger.info({ deletedCount: result.count }, '[IDEMPOTENCY] Cleanup expired keys');
      return result.count;
    } catch (error) {
      logger.error({ error }, '[IDEMPOTENCY] Cleanup error');
      return 0;
    }
  }
}

export default new PaymentIdempotencyService();
