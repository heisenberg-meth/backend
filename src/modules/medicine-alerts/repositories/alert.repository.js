import prisma from '../../../config/prisma.js';
import crypto from 'crypto';

class AlertRepository {
  /**
   * Get low stock alerts with snapshots
   */
  async findLowStockAlerts({ tenantId, branchId, severity, page = 1, limit = 50 }) {
    const skip = (page - 1) * limit;
    const take = limit;

    const where = {
      tenantId,
      branchId: branchId || undefined,
      type: { in: ['LOW_STOCK', 'OUT_OF_STOCK'] },
      severity: severity || undefined,
      isResolved: false,
    };

    const [alerts, total] = await Promise.all([
      prisma.stockAlert.findMany({
        where,
        include: {
          medicine: {
            select: { id: true, name: true, genericName: true, reorderLevel: true },
          },
        },
        orderBy: { severity: 'desc' }, // Assuming priority sorting if severity is comparable
        skip,
        take,
      }),
      prisma.stockAlert.count({ where }),
    ]);

    return {
      alerts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  /**
   * Get expiring medicine alerts with snapshots
   */
  async findExpiryAlerts({ tenantId, branchId, severity, page = 1, limit = 50 }) {
    const skip = (page - 1) * limit;
    const take = limit;

    const where = {
      tenantId,
      branchId: branchId || undefined,
      severity: severity || undefined,
      isResolved: false,
    };

    const [alerts, total] = await Promise.all([
      prisma.expiryAlert.findMany({
        where,
        include: {
          medicine: {
            select: { id: true, name: true, genericName: true },
          },
          batch: {
            select: { id: true, batchNumber: true, quantity: true, expiryDate: true },
          },
        },
        orderBy: { daysRemaining: 'asc' },
        skip,
        take,
      }),
      prisma.expiryAlert.count({ where }),
    ]);

    return {
      alerts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  /**
   * Get out of stock alerts with snapshots
   */
  async findOutOfStockAlerts({ tenantId, branchId, page = 1, limit = 50 }) {
    const skip = (page - 1) * limit;
    const take = limit;

    const where = {
      tenantId,
      branchId: branchId || undefined,
      type: 'OUT_OF_STOCK',
      isResolved: false,
    };

    const [alerts, total] = await Promise.all([
      prisma.stockAlert.findMany({
        where,
        include: {
          medicine: {
            select: { id: true, name: true, genericName: true, prescriptionRequired: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.stockAlert.count({ where }),
    ]);

    return {
      alerts,
      total,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  /**
   * Get all critical alerts (unresolved)
   */
  async findCriticalAlerts({ tenantId, branchId }) {
    return await prisma.stockAlert.findMany({
      where: {
        tenantId,
        branchId: branchId || undefined,
        severity: 'CRITICAL',
        isResolved: false,
      },
      include: {
        medicine: { select: { id: true, name: true, genericName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  /**
   * Get a summary of near-expiry inventory
   */
  async getExpirySummary({ tenantId, branchId }) {
    const alerts = await prisma.expiryAlert.groupBy({
      by: ['severity'],
      where: {
        tenantId,
        branchId: branchId || undefined,
        isResolved: false,
      },
      _count: { _all: true },
    });

    return alerts.reduce(
      (acc, curr) => {
        acc[curr.severity] = curr._count._all;
        return acc;
      },
      { INFO: 0, WARNING: 0, CRITICAL: 0 },
    );
  }

  /**
   * Get alert trends over the last 30 days
   */
  async getAlertTrends({ tenantId, branchId }) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const alerts = await prisma.stockAlert.findMany({
      where: {
        tenantId,
        branchId: branchId || undefined,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true, type: true },
    });

    // Group by date and type
    const trends = {};
    alerts.forEach((a) => {
      const date = a.createdAt.toISOString().split('T')[0];
      if (!trends[date]) trends[date] = { LOW_STOCK: 0, OUT_OF_STOCK: 0 };
      trends[date][a.type]++;
    });

    return Object.entries(trends).map(([date, counts]) => ({ date, ...counts }));
  }

  /**
   * Upsert a stock alert snapshot
   */
  async upsertStockAlert(data) {
    const { tenantId, branchId, medicineId, type } = data;

    // Attempt to find existing unresolved alert of same type for this medicine/branch
    const existing = await prisma.stockAlert.findFirst({
      where: { tenantId, branchId, medicineId, type, isResolved: false },
    });

    if (existing) {
      return await prisma.stockAlert.update({
        where: { id: existing.id },
        data,
      });
    }

    return await prisma.stockAlert.create({ data });
  }

  /**
   * Resolve alerts when stock is replenished
   */
  async resolveStockAlerts(medicineId, tenantId, branchId) {
    return await prisma.stockAlert.updateMany({
      where: { medicineId, tenantId, branchId, isResolved: false },
      data: { isResolved: true, resolvedAt: new Date() },
    });
  }

  /**
   * Batch upsert expiry alerts
   */
  async upsertExpiryAlert(data) {
    const { tenantId, batchId } = data;

    return await prisma.expiryAlert.upsert({
      where: {
        // Need a unique constraint for batch expiry alert if possible, or use findFirst
        // For now, let's assume we use batchId as a key for unresolved alerts
        id:
          (
            await prisma.expiryAlert.findFirst({
              where: { tenantId, batchId, isResolved: false },
              select: { id: true },
            })
          )?.id || crypto.randomUUID(),
      },
      update: data,
      create: data,
    });
  }
}

export default new AlertRepository();
