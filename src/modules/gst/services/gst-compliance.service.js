import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class GstComplianceService {
  async checkReturnFilingCompliance(tenantId = {}) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const months = [];
    for (let i = 0; i < 6; i++) {
      let m = currentMonth - i;
      let y = currentYear;
      if (m < 0) { m += 12; y -= 1; }
      const label = `${y}-${String(m + 1).padStart(2, '0')}`;
      months.push({ month: m + 1, year: y, label });
    }

    const results = [];
    for (const { month, year, label } of months) {
      const from = new Date(year, month - 1, 1);
      const to = new Date(year, month, 0, 23, 59, 59, 999);

      const totalInvoices = await prisma.invoice.count({
        where: {
          tenantId,
          createdAt: { gte: from, lte: to },
          status: { not: 'CANCELLED' },
          deletedAt: null,
        },
      });

      const summary = await prisma.gstSummary.findUnique({
        where: {
          tenantId_reportMonth: {
            tenantId,
            reportMonth: label,
          },
        },
        select: { id: true, updatedAt: true },
      });

      const dueDate = new Date(year, month, 20);
      const isDue = now > dueDate;

      results.push({
        period: label,
        invoicesCount: totalInvoices,
        summarySubmitted: !!summary,
        submittedAt: summary?.updatedAt || null,
        dueDate,
        isOverdue: isDue && !summary,
        status: summary ? 'COMPLIANT' : (isDue ? 'OVERDUE' : 'PENDING'),
      });
    }

    const overdueCount = results.filter((r) => r.isOverdue).length;

    logger.info(`[GST Compliance] Checked ${months.length} periods, ${overdueCount} overdue`);

    return {
      compliance: results,
      overallStatus: overdueCount > 0 ? 'NON_COMPLIANT' : 'COMPLIANT',
      overduePeriods: overdueCount,
      checkedPeriods: months.length,
    };
  }

  async getComplianceOverview(tenantId) {
    const [gstSettings, invoiceStats] = await Promise.all([
      prisma.gstSetting.findFirst({ where: { tenantId } }),
      prisma.invoice.aggregate({
        where: { tenantId, deletedAt: null, createdAt: { gte: new Date(new Date().getFullYear(), 0, 1) } },
        _count: true,
        _sum: { gstAmount: true },
      }),
    ]);

    const compliance = await this.checkReturnFilingCompliance(tenantId);

    return {
      settingsConfigured: !!gstSettings,
      currentYearInvoices: invoiceStats._count,
      currentYearGst: invoiceStats._sum?.gstAmount || 0,
      returnFiling: compliance,
    };
  }
}

export default new GstComplianceService();
