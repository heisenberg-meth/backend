import redisClient from '../../../config/redis.js';

const DEDUPE_TTL = 3600;
const ESCALATION_TTL = 86400;

class AlertDeduplicationService {
  async checkDuplicate(tenantId, medicineId, branchId, alertType) {
    const dedupeKey = this._buildDedupeKey(tenantId, medicineId, branchId, alertType);
    const exists = await redisClient.get(dedupeKey);
    return !!exists;
  }

  async markProcessed(tenantId, medicineId, branchId, alertType) {
    const dedupeKey = this._buildDedupeKey(tenantId, medicineId, branchId, alertType);
    await redisClient.set(dedupeKey, '1', 'EX', DEDUPE_TTL);
  }

  async clearDedupe(tenantId, medicineId, branchId, alertType) {
    const dedupeKey = this._buildDedupeKey(tenantId, medicineId, branchId, alertType);
    await redisClient.del(dedupeKey);
  }

  async trackEscalation(alertId, tenantId) {
    const escalationKey = `alert:escalation:${tenantId}:${alertId}`;
    const count = await redisClient.incr(escalationKey);

    if (count === 1) {
      await redisClient.expire(escalationKey, ESCALATION_TTL);
    }

    return count;
  }

  async getEscalationCount(alertId, tenantId) {
    const escalationKey = `alert:escalation:${tenantId}:${alertId}`;
    const count = await redisClient.get(escalationKey);
    return count ? parseInt(count, 10) : 0;
  }

  async clearEscalation(alertId, tenantId) {
    const escalationKey = `alert:escalation:${tenantId}:${alertId}`;
    await redisClient.del(escalationKey);
  }

  async setSnoozeExpiry(alertId, tenantId, snoozedUntil) {
    const snoozeKey = `alert:snooze:${tenantId}:${alertId}`;
    const ttlSeconds = Math.ceil((new Date(snoozedUntil).getTime() - Date.now()) / 1000);

    if (ttlSeconds > 0) {
      await redisClient.set(snoozeKey, '1', 'EX', ttlSeconds);
    }
  }

  async isSnoozed(alertId, tenantId) {
    const snoozeKey = `alert:snooze:${tenantId}:${alertId}`;
    const exists = await redisClient.get(snoozeKey);
    return !!exists;
  }

  async clearSnoozeExpiry(alertId, tenantId) {
    const snoozeKey = `alert:snooze:${tenantId}:${alertId}`;
    await redisClient.del(snoozeKey);
  }

  _buildDedupeKey(tenantId, medicineId, branchId, alertType) {
    return `alert:dedupe:${tenantId}:${medicineId}:${branchId || 'all'}:${alertType}`;
  }
}

export default new AlertDeduplicationService();
