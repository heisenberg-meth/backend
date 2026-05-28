import queueService from '../queues/queue.service.js';
import prisma from '../../../config/prisma.js';

class NotificationMonitoringService {
  /**
   * Get overall system health metrics
   */
  async getHealthMetrics(tenantId) {
    const [queueMetrics, providerStats, deliverySuccessRate] = await Promise.all([
      queueService.getMetrics(),
      this._getProviderStats(tenantId),
      this._getDeliverySuccessRate(tenantId),
    ]);

    return {
      queues: queueMetrics,
      providers: providerStats,
      successRate: deliverySuccessRate,
      timestamp: new Date(),
    };
  }

  async _getProviderStats(tenantId) {
    return await prisma.notificationChannelConfig.findMany({
      where: { tenantId, isActive: true },
      select: {
        channelType: true,
        providerName: true,
        totalSent: true,
        totalFailed: true,
        lastUsedAt: true,
      },
    });
  }

  async _getDeliverySuccessRate(tenantId) {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const stats = await prisma.notification.groupBy({
      by: ['deliveryStatus'],
      where: {
        tenantId,
        createdAt: { gte: oneDayAgo },
      },
      _count: { id: true },
    });

    const total = stats.reduce((acc, curr) => acc + curr._count.id, 0);
    const delivered = stats.find(s => s.deliveryStatus === 'SENT' || s.deliveryStatus === 'DELIVERED')?._count.id || 0;

    return total > 0 ? (delivered / total) * 100 : 100;
  }
}

export default new NotificationMonitoringService();
