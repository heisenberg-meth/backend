import prisma from '../../../config/prisma.js';
import { PURCHASE_ORDER_STATUS } from '../../../shared/constants/purchase-order-status.js';
import logger from '../../../shared/utils/logger.js';

class BusinessIntelligenceService {
  async generateExecutiveSummary(tenantId) {
    const insights = await Promise.all([
      this._generateRevenueInsight(tenantId),
      this._generateInventoryInsight(tenantId),
      this._generateOperationalInsight(tenantId),
    ]);

    const created = [];
    for (const insight of insights) {
      if (!insight) continue;
      const record = await prisma.executiveInsight.create({ data: insight });
      created.push(record);
    }

    logger.info({ count: created.length, tenantId }, '[BI_SERVICE] Executive insights generated');
    return created;
  }

  async _generateRevenueInsight(tenantId) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [thisMonth, lastMonth] = await Promise.all([
      prisma.invoice.aggregate({
        where: { tenantId, createdAt: { gte: monthStart }, status: 'ACTIVE' },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      prisma.invoice.aggregate({
        where: { tenantId, createdAt: { gte: lastMonthStart, lt: monthStart }, status: 'ACTIVE' },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
    ]);

    const thisRev = Number(thisMonth._sum.totalAmount || 0);
    const lastRev = Number(lastMonth._sum.totalAmount || 0);
    const pctChange = lastRev > 0 ? ((thisRev - lastRev) / lastRev) * 100 : 0;

    return {
      tenantId,
      insightType: 'REVENUE',
      insightText: `Monthly revenue is ₹${thisRev.toLocaleString('en-IN')} across ${thisMonth._count.id} invoices (${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}% vs previous month).`,
      confidenceScore: thisRev > 0 ? 0.88 : 0.5,
      reasoning: { currentRevenue: thisRev, previousRevenue: lastRev, percentageChange: pctChange, invoiceCount: thisMonth._count.id },
    };
  }

  async _generateInventoryInsight(tenantId) {
    const [slowCount, deadCount, expirySoon, totalStock] = await Promise.all([
      prisma.slowMovingStock.count({ where: { tenantId } }),
      prisma.deadStockAnalysis.count({ where: { tenantId } }),
      prisma.inventoryBatch.count({
        where: { tenantId, status: 'ACTIVE', expiryDate: { lte: new Date(Date.now() + 90 * 86400000) } },
      }),
      prisma.inventoryBatch.aggregate({
        where: { tenantId, status: 'ACTIVE' },
        _sum: { quantity: true },
      }),
    ]);

    const totalQty = Number(totalStock._sum.quantity || 0);

    return {
      tenantId,
      insightType: 'INVENTORY',
      insightText: `Inventory has ${totalQty} units across all batches. ${expirySoon} batches expiring within 90 days, ${slowCount} slow-moving items, ${deadCount} dead-stock items identified.`,
      confidenceScore: totalQty > 0 ? 0.92 : 0.6,
      reasoning: { totalUnits: totalQty, expiringSoon: expirySoon, slowMovingCount: slowCount, deadStockCount: deadCount },
    };
  }

  async _generateOperationalInsight(tenantId) {
    const [pendingPOs, activePatients, allMeds] = await Promise.all([
      prisma.purchaseOrder.count({ where: { tenantId, status: { in: [PURCHASE_ORDER_STATUS.PENDING_APPROVAL, PURCHASE_ORDER_STATUS.APPROVED] } } }),
      prisma.patient.count({ where: { tenantId, deletedAt: null } }),
      prisma.medicine.findMany({
        where: { tenantId, deletedAt: null, reorderLevel: { gt: 0 } },
        select: { totalQuantity: true, reorderLevel: true },
      }),
    ]);

    const lowStockMeds = allMeds.filter((m) => m.totalQuantity <= m.reorderLevel).length;

    return {
      tenantId,
      insightType: 'OPERATIONAL',
      insightText: `${pendingPOs} pending purchase orders, ${activePatients} active patients, ${lowStockMeds} medicines below reorder level.`,
      confidenceScore: 0.85,
      reasoning: { pendingPurchaseOrders: pendingPOs, activePatients, lowStockMedicines: lowStockMeds },
    };
  }
}

export default new BusinessIntelligenceService();
