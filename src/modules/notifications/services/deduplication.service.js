import redisClient from '../../../config/redis.js';

const DEDUPE_TTL = 1800;

class NotificationDeduplicationService {
  async checkDuplicate(tenantId, channel, recipient, templateName, notificationType) {
    const dedupeKey = this._buildDedupeKey(
      tenantId,
      channel,
      recipient,
      templateName,
      notificationType,
    );
    const exists = await redisClient.get(dedupeKey);
    return !!exists;
  }

  async markSent(tenantId, channel, recipient, templateName, notificationType) {
    const dedupeKey = this._buildDedupeKey(
      tenantId,
      channel,
      recipient,
      templateName,
      notificationType,
    );
    await redisClient.set(dedupeKey, '1', 'EX', DEDUPE_TTL);
  }

  async clearDedupe(tenantId, channel, recipient, templateName, notificationType) {
    const dedupeKey = this._buildDedupeKey(
      tenantId,
      channel,
      recipient,
      templateName,
      notificationType,
    );
    await redisClient.del(dedupeKey);
  }

  async setCooldown(notificationId, cooldownSeconds = 1800) {
    const cooldownKey = `notification:cooldown:${notificationId}`;
    await redisClient.set(cooldownKey, '1', 'EX', cooldownSeconds);
  }

  async isInCooldown(notificationId) {
    const cooldownKey = `notification:cooldown:${notificationId}`;
    const exists = await redisClient.get(cooldownKey);
    return !!exists;
  }

  _buildDedupeKey(tenantId, channel, recipient, templateName, notificationType) {
    return `notification:dedupe:${tenantId}:${channel}:${recipient}:${templateName || 'none'}:${notificationType || 'none'}`;
  }
}

export default new NotificationDeduplicationService();
