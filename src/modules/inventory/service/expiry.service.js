import prisma from '../../../config/prisma.js';

class ExpiryService {
  /**
   * Helper to get date boundaries for expiry buckets
   */
  getDateBoundaries() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const plus7 = new Date(today);
    plus7.setDate(today.getDate() + 7);

    const plus8 = new Date(today);
    plus8.setDate(today.getDate() + 8);

    const plus30 = new Date(today);
    plus30.setDate(today.getDate() + 30);

    const plus31 = new Date(today);
    plus31.setDate(today.getDate() + 31);

    const plus90 = new Date(today);
    plus90.setDate(today.getDate() + 90);

    return { today, plus7, plus8, plus30, plus31, plus90 };
  }

  getExpiryWhereClause(bucket) {
    const { today, plus7, plus8, plus30, plus31, plus90 } = this.getDateBoundaries();

    switch (bucket) {
      case 'EXPIRED':
        return { expiryDate: { lt: today } };
      case 'SEVEN_DAYS':
        return { expiryDate: { gte: today, lte: plus7 } };
      case 'THIRTY_DAYS':
        return { expiryDate: { gte: plus8, lte: plus30 } };
      case 'NINETY_DAYS':
        return { expiryDate: { gte: plus31, lte: plus90 } };
      case 'SAFE':
        return { expiryDate: { gt: plus90 } };
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

  async getExpirySummary(tenantId, branchId = null) {
    const baseWhere = {
      tenantId,
      ...(branchId ? { branchId } : {}),
      deletedAt: null,
      availableQuantity: { gt: 0 },
    };

    const { today, plus7, plus8, plus30, plus31, plus90 } = this.getDateBoundaries();

    const [expired, days7, days30, days90, safe] = await Promise.all([
      prisma.inventoryBatch.count({ where: { ...baseWhere, expiryDate: { lt: today } } }),
      prisma.inventoryBatch.count({
        where: { ...baseWhere, expiryDate: { gte: today, lte: plus7 } },
      }),
      prisma.inventoryBatch.count({
        where: { ...baseWhere, expiryDate: { gte: plus8, lte: plus30 } },
      }),
      prisma.inventoryBatch.count({
        where: { ...baseWhere, expiryDate: { gte: plus31, lte: plus90 } },
      }),
      prisma.inventoryBatch.count({ where: { ...baseWhere, expiryDate: { gt: plus90 } } }),
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
