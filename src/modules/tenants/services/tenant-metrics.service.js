import prisma from '../../../config/prisma.js';

class TenantMetricsService {
  /**
   * Track a specific usage event
   */
  async trackUsage(tenantId, type, value = 1) {
    return prisma.usageMetric.create({
      data: {
        tenantId,
        metricType: type,
        metricValue: value,
      },
    });
  }

  /**
   * Get aggregate metrics for a billing period
   */
  async getUsageSummary(tenantId, from, to) {
    const metrics = await prisma.usageMetric.groupBy({
      by: ['metricType'],
      where: {
        tenantId,
        recordedAt: { gte: from, lte: to },
      },
      _sum: { metricValue: true },
    });

    return metrics.reduce((acc, curr) => {
      acc[curr.metricType] = curr._sum.metricValue;
      return acc;
    }, {});
  }
}

export default new TenantMetricsService();
