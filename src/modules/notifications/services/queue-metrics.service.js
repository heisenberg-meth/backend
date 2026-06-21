import prisma from '../../../config/prisma.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';
import logger from '../../../shared/utils/logger.js';

class QueueMetricsService {
  async getQueueMetrics(tenantId) {
    const recent = new Date();
    recent.setHours(recent.getHours() - 1);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalQueued, totalProcessed, totalFailed, totalDlq, hourlyVolume, todayByChannel] =
      await Promise.all([
        prisma.notification.count({ where: { tenantId, deliveryStatus: 'QUEUED' } }),
        prisma.notification.count({
          where: { tenantId, deliveryStatus: { in: ['SENT', 'DELIVERED'] } },
        }),
        prisma.notification.count({ where: { tenantId, deliveryStatus: 'FAILED' } }),
        prisma.notification.count({ where: { tenantId, deliveryStatus: 'DEAD_LETTER' } }),
        prisma.notification.count({
          where: { tenantId, createdAt: { gte: recent } },
        }),
        prisma.notification.groupBy({
          by: ['channel'],
          where: { tenantId, createdAt: { gte: today } },
          _count: true,
        }),
      ]);

    const queueDepth = await this.getQueueDepth();

    const total = totalQueued + totalProcessed + totalFailed + totalDlq;
    const health = total > 0 ? Math.round((totalProcessed / total) * 100) : 100;

    const channelBreakdown = {};
    for (const item of todayByChannel) {
      channelBreakdown[item.channel] = item._count;
    }

    return {
      queueDepth,
      totalQueued,
      totalProcessed,
      totalFailed,
      totalDlq,
      hourlyVolume,
      health,
      channelBreakdown,
    };
  }

  async getQueueDepth() {
    try {
      const keys = await scanKeys('bull:viyan-medassist-notifications:*');
      const waiting = keys.filter((k) => k.includes('wait')).length;
      const active = keys.filter((k) => k.includes('active')).length;
      return { waiting, active, total: waiting + active };
    } catch (err) {
      logger.error({ error: err.message }, 'Failed to get queue depth from Redis — returning null to indicate unavailable');
      return null;
    }
  }
}

export default new QueueMetricsService();
