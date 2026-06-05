import prisma from '../../../config/prisma.js';
import { PURCHASE_ORDER_STATUS } from '../../../shared/constants/purchase-order-status.js';

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
    const where = {
      tenantId,
      isResolved: false,
      type: 'LOW_STOCK',
    };
    if (branchId) where.branchId = branchId;

    return prisma.stockAlert.count({ where });
  }

  async getTopLowStockMedicines(tenantId, limit = 5) {
    return prisma.medicine.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
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

  async getExpiringMedicinesCount(tenantId, branchId = null) {
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const where = {
      medicine: { tenantId, deletedAt: null },
      expiryDate: { gte: now, lte: thirtyDaysLater },
      quantity: { gt: 0 },
      deletedAt: null,
    };
    if (branchId) where.medicine.branchId = branchId;

    return prisma.inventoryBatch.count({ where });
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
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const where = {
      medicine: { tenantId, deletedAt: null, isActive: true },
      deletedAt: null,
    };
    if (branchId) where.medicine.branchId = branchId;

    const [totalBatches, stockValueAgg] = await Promise.all([
      prisma.inventoryBatch.count({ where }),
      prisma.inventoryBatch.aggregate({
        where,
        _sum: { quantity: true },
      }),
    ]);

    const expiredCount = await prisma.inventoryBatch.count({
      where: {
        ...where,
        expiryDate: { lt: now },
        quantity: { gt: 0 },
      },
    });

    const expiringCount = await prisma.inventoryBatch.count({
      where: {
        ...where,
        expiryDate: { gte: now, lte: thirtyDaysLater },
        quantity: { gt: 0 },
      },
    });

    const outOfStockCount = await prisma.medicine.count({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        inventoryBatches: {
          none: {
            quantity: { gt: 0 },
            deletedAt: null,
          },
        },
      },
    });

    const lowStockCount = await this.getLowStockCount(tenantId, branchId);

    return {
      totalBatches,
      totalStock: stockValueAgg._sum.quantity || 0,
      expiredCount,
      expiringCount,
      outOfStockCount,
      lowStockCount,
    };
  }

  async getAlertsBySeverity(tenantId, branchId = null, limit = 20) {
    const where = {
      tenantId,
      isResolved: false,
    };
    if (branchId) where.branchId = branchId;

    const alerts = await prisma.stockAlert.findMany({
      where,
      include: {
        medicine: { select: { id: true, name: true } },
      },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    const expiredBatches = await prisma.inventoryBatch.findMany({
      where: {
        medicine: { tenantId, deletedAt: null },
        expiryDate: { lt: new Date() },
        quantity: { gt: 0 },
        deletedAt: null,
        ...(branchId && { medicine: { branchId } }),
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
    });

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
    else where.branchId = null;

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
