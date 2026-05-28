import prisma from '../../../config/prisma.js';

class NotificationAnalyticsService {
  async getDeliveryStats(tenantId, options = {}) {
    const { days = 30, channel } = options;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const where = {
      tenantId,
      createdAt: { gte: since },
    };

    if (channel) {
      where.channel = channel;
    }

    const [total, byChannel, byStatus, failedNotifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.groupBy({
        by: ['channel'],
        where,
        _count: true,
      }),
      prisma.notification.groupBy({
        by: ['deliveryStatus'],
        where,
        _count: true,
      }),
      prisma.notification.findMany({
        where: { ...where, deliveryStatus: 'FAILED' },
        select: { channel: true, notificationType: true, createdAt: true, retryCount: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const channelBreakdown = {};
    for (const item of byChannel) {
      channelBreakdown[item.channel] = item._count;
    }

    const statusBreakdown = {};
    for (const item of byStatus) {
      statusBreakdown[item.deliveryStatus] = item._count;
    }

    const successRate = total > 0
      ? ((statusBreakdown['DELIVERED'] || 0) + (statusBreakdown['SENT'] || 0)) / total * 100
      : 0;

    return {
      total,
      channelBreakdown,
      statusBreakdown,
      successRate: parseFloat(successRate.toFixed(2)),
      recentFailures: failedNotifications,
      period: `${days} days`,
    };
  }

  async getProviderPerformance(tenantId, options = {}) {
    const { days = 30 } = options;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const events = await prisma.notificationDeliveryEvent.findMany({
      where: {
        notification: { tenantId },
        eventTimestamp: { gte: since },
        providerName: { not: null },
      },
      select: {
        providerName: true,
        eventType: true,
        eventTimestamp: true,
      },
    });

    const providerMap = {};

    for (const event of events) {
      const provider = event.providerName;
      if (!providerMap[provider]) {
        providerMap[provider] = {
          providerName: provider,
          total: 0,
          sent: 0,
          delivered: 0,
          failed: 0,
          avgLatency: 0,
          totalLatency: 0,
        };
      }

      providerMap[provider].total++;

      if (event.eventType === 'SENT') providerMap[provider].sent++;
      if (event.eventType === 'DELIVERED') providerMap[provider].delivered++;
      if (event.eventType === 'FAILED') providerMap[provider].failed++;
    }

    return Object.values(providerMap).map((p) => ({
      ...p,
      successRate: p.total > 0 ? ((p.delivered + p.sent) / p.total * 100).toFixed(2) : 0,
    }));
  }

  async getResponseTimes(tenantId, options = {}) {
    const { days = 30, channel } = options;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const where = {
      tenantId,
      sentAt: { gte: since },
      deliveryStatus: { in: ['SENT', 'DELIVERED'] },
    };

    if (channel) {
      where.channel = channel;
    }

    const notifications = await prisma.notification.findMany({
      where,
      select: {
        channel: true,
        createdAt: true,
        sentAt: true,
      },
    });

    const channelLatency = {};

    for (const n of notifications) {
      if (!n.sentAt) continue;

      const latency = n.sentAt.getTime() - n.createdAt.getTime();
      if (!channelLatency[n.channel]) {
        channelLatency[n.channel] = { total: 0, count: 0, min: Infinity, max: 0 };
      }

      channelLatency[n.channel].total += latency;
      channelLatency[n.channel].count++;
      channelLatency[n.channel].min = Math.min(channelLatency[n.channel].min, latency);
      channelLatency[n.channel].max = Math.max(channelLatency[n.channel].max, latency);
    }

    return Object.entries(channelLatency).map(([channel, data]) => ({
      channel,
      avgLatencyMs: data.count > 0 ? Math.round(data.total / data.count) : 0,
      minLatencyMs: data.min === Infinity ? 0 : data.min,
      maxLatencyMs: data.max,
      sampleSize: data.count,
    }));
  }

  async getAlertResponseTimes(tenantId, options = {}) {
    const { days = 30 } = options;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const alerts = await prisma.stockAlert.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
        resolvedAt: { not: null },
      },
      select: {
        type: true,
        severity: true,
        createdAt: true,
        resolvedAt: true,
      },
    });

    const typeResponse = {};

    for (const alert of alerts) {
      const responseTime = alert.resolvedAt.getTime() - alert.createdAt.getTime();
      const type = alert.type;

      if (!typeResponse[type]) {
        typeResponse[type] = { total: 0, count: 0, min: Infinity, max: 0 };
      }

      typeResponse[type].total += responseTime;
      typeResponse[type].count++;
      typeResponse[type].min = Math.min(typeResponse[type].min, responseTime);
      typeResponse[type].max = Math.max(typeResponse[type].max, responseTime);
    }

    return Object.entries(typeResponse).map(([type, data]) => ({
      type,
      avgResponseTimeMs: data.count > 0 ? Math.round(data.total / data.count) : 0,
      minResponseTimeMs: data.min === Infinity ? 0 : data.min,
      maxResponseTimeMs: data.max,
      sampleSize: data.count,
    }));
  }

  async getChannelUsage(tenantId, options = {}) {
    const { days = 30 } = options;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const usage = await prisma.notification.groupBy({
      by: ['channel', 'notificationType'],
      where: {
        tenantId,
        createdAt: { gte: since },
      },
      _count: true,
    });

    const channelUsage = {};

    for (const item of usage) {
      if (!channelUsage[item.channel]) {
        channelUsage[item.channel] = { total: 0, byType: {} };
      }

      channelUsage[item.channel].total += item._count;
      channelUsage[item.channel].byType[item.notificationType || 'unknown'] = item._count;
    }

    return channelUsage;
  }
}

export default new NotificationAnalyticsService();
