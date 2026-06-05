import refundRepository from '../repositories/refund.repository.js';

class RefundAnalyticsService {
  async getRefundAnalytics(tenantId, options = {}) {
    const analytics = await refundRepository.getAnalytics(tenantId, options);
    const pendingApprovals = await refundRepository.countPendingApprovals(tenantId);

    const refundRate =
      analytics.totalSales > 0
        ? parseFloat(
            ((Number(analytics.totalRefundAmount) / Number(analytics.totalSales)) * 100).toFixed(2),
          )
        : 0;

    const topReasons = analytics.byReason.map((r) => ({
      reason: r.returnReason,
      count: r._count,
      totalAmount: Number(r._sum?.totalReturnAmount || 0),
    }));

    return {
      totalRefunds: analytics.totalRefunds,
      totalRefundAmount: Number(analytics.totalRefundAmount),
      totalSales: Number(analytics.totalSales),
      refundRate,
      pendingApprovals,
      topReasons,
      monthlyTrend: analytics.monthlyData,
    };
  }

  async getFraudAlerts(tenantId, options = {}) {
    const { limit = 20 } = options;

    const fraudAlerts = await refundRepository.findRefunds(tenantId, {
      limit,
      include: {
        invoice: { select: { invoiceNumber: true } },
        patient: { select: { fullName: true } },
      },
    });

    const flagged = fraudAlerts.data.filter((r) => r.fraudScore >= 30 || r.fraudFlags.length > 0);

    return flagged.map((r) => ({
      id: r.id,
      returnNumber: r.returnNumber,
      invoiceNumber: r.invoice?.invoiceNumber,
      patientName: r.patient?.fullName,
      totalReturnAmount: Number(r.totalReturnAmount),
      fraudScore: r.fraudScore,
      fraudFlags: r.fraudFlags,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  async getRefundSummary(tenantId, period) {
    const from = period.from || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = period.to || new Date();

    const analytics = await refundRepository.getAnalytics(tenantId, { from, to });

    return {
      period: { from, to },
      totalRefunds: analytics.totalRefunds,
      totalRefundAmount: Number(analytics.totalRefundAmount),
      refundRate:
        analytics.totalSales > 0
          ? parseFloat(
              ((Number(analytics.totalRefundAmount) / Number(analytics.totalSales)) * 100).toFixed(
                2,
              ),
            )
          : 0,
    };
  }
}

export default new RefundAnalyticsService();
