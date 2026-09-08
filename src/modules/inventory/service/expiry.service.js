import prisma from '../../../config/prisma.js';
import { getCalendarBoundaries } from '../../../shared/utils/expiry.js';

class ExpiryService {
  /**
   * Helper to get date boundaries for expiry buckets
   */
  getDateBoundaries() {
    return getCalendarBoundaries();
  }

  getExpiryWhereClause(bucket) {
    const { todayEnd, plus7End, plus30End, plus90End } = this.getDateBoundaries();

    switch (bucket) {
      case 'EXPIRED':
        return {
          OR: [{ expiryDate: { lte: todayEnd } }, { status: 'EXPIRED' }],
        };
      case 'SEVEN_DAYS':
        return {
          status: { not: 'EXPIRED' },
          expiryDate: { gt: todayEnd, lte: plus7End },
        };
      case 'THIRTY_DAYS':
        return {
          status: { not: 'EXPIRED' },
          expiryDate: { gt: plus7End, lte: plus30End },
        };
      case 'NINETY_DAYS':
        return {
          status: { not: 'EXPIRED' },
          expiryDate: { gt: plus30End, lte: plus90End },
        };
      case 'SAFE':
        return {
          status: { not: 'EXPIRED' },
          expiryDate: { gt: plus90End },
        };
      default:
        return {};
    }
  }

  async getBatchesByBucket(tenantId, bucket, branchId = null, additionalWhere = {}) {
    return prisma.inventoryBatch.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        ...this.getExpiryWhereClause(bucket),
        deletedAt: null,
        availableQuantity: { gt: 0 },
        ...additionalWhere,
      },
      include: {
        medicine: { select: { id: true, name: true, genericName: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async getNearExpiryBatches(tenantId, days = 30, branchId = null) {
    const { todayEnd } = this.getDateBoundaries();
    const thresholdDate = new Date(todayEnd);
    thresholdDate.setDate(thresholdDate.getDate() + Number(days));

    const expiryFilter =
      Number(days) <= 0
        ? { OR: [{ expiryDate: { lte: todayEnd } }, { status: 'EXPIRED' }] }
        : {
            status: { not: 'EXPIRED' },
            expiryDate: { gt: todayEnd, lte: thresholdDate },
          };

    return prisma.inventoryBatch.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        ...expiryFilter,
        deletedAt: null,
        availableQuantity: { gt: 0 },
      },
      include: {
        medicine: { select: { id: true, name: true, genericName: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async getExpirySummary(tenantId, branchId = null) {
    const baseWhere = {
      tenantId,
      ...(branchId ? { branchId } : {}),
      deletedAt: null,
      availableQuantity: { gt: 0 },
    };

    const { todayEnd, plus7End, plus30End, plus90End } = this.getDateBoundaries();

    const [expired, days7, days30, days90, safe] = await Promise.all([
      prisma.inventoryBatch.count({
        where: {
          ...baseWhere,
          OR: [{ expiryDate: { lte: todayEnd } }, { status: 'EXPIRED' }],
        },
      }),
      prisma.inventoryBatch.count({
        where: {
          ...baseWhere,
          status: { not: 'EXPIRED' },
          expiryDate: { gt: todayEnd, lte: plus7End },
        },
      }),
      prisma.inventoryBatch.count({
        where: {
          ...baseWhere,
          status: { not: 'EXPIRED' },
          expiryDate: { gt: plus7End, lte: plus30End },
        },
      }),
      prisma.inventoryBatch.count({
        where: {
          ...baseWhere,
          status: { not: 'EXPIRED' },
          expiryDate: { gt: plus30End, lte: plus90End },
        },
      }),
      prisma.inventoryBatch.count({
        where: {
          ...baseWhere,
          status: { not: 'EXPIRED' },
          expiryDate: { gt: plus90End },
        },
      }),
    ]);

    return {
      expired,
      expiring7Days: days7,
      expiring30Days: days30,
      expiring90Days: days90,
      safe,
    };
  }
}

export default new ExpiryService();
