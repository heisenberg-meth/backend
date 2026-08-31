import { Prisma } from '@prisma/client';
import prisma from '../../../config/prisma.js';
import { PURCHASE_ORDER_STATUS } from '../../../shared/constants/purchase-order-status.js';
import unifiedInventorySummaryService from '../../inventory/service/unified-inventory-summary.service.js';

class DashboardAggregationRepository {
  async getTodaySales(tenantId, branchId = null) {
    const where = { tenantId, soldAt: { gte: this._startOfDay() } };
    if (branchId) where.branchId = branchId;

    return prisma.sale.aggregate({
      where,
      _sum: { totalAmount: true },
      _count: { id: true },
    });
  }

  async getMonthSales(tenantId, branchId = null) {
    const where = { tenantId, soldAt: { gte: this._startOfMonth() } };
    if (branchId) where.branchId = branchId;

    return prisma.sale.aggregate({
      where,
      _sum: { totalAmount: true },
      _count: { id: true },
    });
  }

  async getDailySalesSummary(tenantId, branchId = null, date = null) {
    const salesDate = date ? new Date(date) : new Date();
    salesDate.setHours(0, 0, 0, 0);

    const where = {
      tenantId,
      salesDate,
    };
    if (branchId) where.branchId = branchId;

    return prisma.dailySalesSummary.findFirst({ where });
  }

  async getPaymentMethodBreakdown(tenantId, branchId = null, date = null) {
    const paymentDate = date ? new Date(date) : new Date();
    paymentDate.setHours(0, 0, 0, 0);

    const where = {
      tenantId,
      paymentDate,
    };
    if (branchId) where.branchId = branchId;

    return prisma.paymentMethodAnalytics.findMany({ where });
  }

  async getTopSellingMedicines(tenantId, branchId = null, limit = 5) {
    const where = {
      sale: {
        tenantId,
        soldAt: { gte: this._startOfMonth() },
      },
    };
    if (branchId) {
      where.sale.branchId = branchId;
    }

    return prisma.saleItem.groupBy({
      by: ['medicineId'],
      where,
      _sum: { quantity: true, totalAmount: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });
  }

  async getLowStockCount(tenantId, branchId = null) {
    const branchCondition = branchId ? Prisma.sql`AND ib."branchId" = ${branchId}` : Prisma.sql``;

    const results = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count
      FROM (
        SELECT
            m.id,
            COALESCE(SUM(ib."availableQuantity"), 0) as stock,
            COALESCE(MAX(i."reorderPoint"), m."reorderLevel", 10) as reorder_level
        FROM "Medicine" m
        LEFT JOIN "InventoryBatch" ib
            ON ib."medicineId" = m.id
            AND ib."tenantId" = m."tenantId"
            AND ib."deletedAt" IS NULL
            ${branchCondition}
        LEFT JOIN "Inventory" i
            ON i."medicineId" = m.id
            AND i."tenantId" = m."tenantId"
            ${branchId ? Prisma.sql`AND i."branchId" = ${branchId}` : Prisma.sql``}
        WHERE m."tenantId" = ${tenantId}
          AND m."deletedAt" IS NULL
          AND m."isActive" = true
        GROUP BY m.id, m."reorderLevel"
      ) x
      WHERE stock <= reorder_level AND stock > 0;
    `;
    return Number(results?.[0]?.count || 0);
  }

  async getTopLowStockMedicines(tenantId, limit = 5) {
    return prisma.medicine.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        inventoryBatches: {
          where: { deletedAt: null },
          select: { quantity: true },
        },
      },
      take: limit,
    });
  }

  async getPendingPurchaseOrders(tenantId, branchId = null) {
    const where = {
      tenantId,
      status: {
        in: [
          PURCHASE_ORDER_STATUS.DRAFT,
          PURCHASE_ORDER_STATUS.PENDING_APPROVAL,
          PURCHASE_ORDER_STATUS.APPROVED,
        ],
      },
      deletedAt: null,
    };
    if (branchId) where.branchId = branchId;

    return prisma.purchaseOrder.count({ where });
  }

  async getStockHealthMetrics(tenantId, branchId = null) {
    const [summary, expiry] = await Promise.all([
      unifiedInventorySummaryService.getUnifiedSummary(tenantId, branchId),
      unifiedInventorySummaryService.getExpiryMetrics(tenantId, branchId),
    ]);

    return {
      totalBatches: expiry.totalBatches,
      totalStock: summary.totalStock,
      expiredCount: expiry.expiredBatches,
      expiringCount: expiry.expiring30CombinedBatches,
      outOfStockCount: summary.outOfStockCount,
      lowStockCount: summary.lowStockCount,
    };
  }

  async getAlertsBySeverity(tenantId, branchId = null, limit = 20) {
    const where = {
      tenantId,
      isResolved: false,
    };
    if (branchId) where.branchId = branchId;

    const results = await Promise.allSettled([
      prisma.stockAlert.findMany({
        where,
        include: {
          medicine: { select: { id: true, name: true } },
        },
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      }),
      prisma.inventoryBatch.findMany({
        where: {
          medicine: { tenantId, deletedAt: null },
          OR: [
            {
              expiryDate: {
                lt: (() => {
                  const d = new Date();
                  d.setHours(0, 0, 0, 0);
                  return d;
                })(),
              },
            },
            { status: 'EXPIRED' },
          ],
          availableQuantity: { gt: 0 },
          deletedAt: null,
          ...(branchId && { branchId }),
        },
        select: {
          id: true,
          batchNumber: true,
          quantity: true,
          expiryDate: true,
          purchasePrice: true,
          medicine: { select: { id: true, name: true } },
        },
        take: limit,
        orderBy: { expiryDate: 'asc' },
      }),
    ]);

    const alerts = results[0].status === 'fulfilled' ? results[0].value : [];
    const expiredBatches = results[1].status === 'fulfilled' ? results[1].value : [];

    return { alerts, expiredBatches };
  }

  async saveSnapshot(tenantId, snapshotType, snapshotData, branchId = null, ttlSeconds = 300) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    await prisma.dashboardSnapshot.updateMany({
      where: {
        tenantId,
        branchId: branchId || null,
        snapshotType,
        isValid: true,
      },
      data: { isValid: false },
    });

    return prisma.dashboardSnapshot.create({
      data: {
        tenantId,
        branchId: branchId || null,
        snapshotType,
        snapshotData,
        computedAt: now,
        expiresAt,
        isValid: true,
      },
    });
  }

  async getValidSnapshot(tenantId, snapshotType, branchId = null) {
    const where = {
      tenantId,
      snapshotType,
      isValid: true,
      expiresAt: { gt: new Date() },
    };
    if (branchId) where.branchId = branchId;

    return prisma.dashboardSnapshot.findFirst({
      where,
      orderBy: { computedAt: 'desc' },
    });
  }

  async invalidateSnapshots(tenantId, branchId = null) {
    const where = { tenantId, isValid: true };
    if (branchId) where.branchId = branchId;

    return prisma.dashboardSnapshot.updateMany({
      where,
      data: { isValid: false },
    });
  }

  _startOfDay() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  _startOfMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

export default new DashboardAggregationRepository();
