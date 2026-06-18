import { Prisma } from '@prisma/client';
import prisma from '../../../config/prisma.js';

class AnalyticsRepository {
  async getSkuCount(tenantId) {
    return prisma.medicine.count({
      where: { tenantId, deletedAt: null },
    });
  }

  async getLowStockCount(tenantId) {
    const result = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count
      FROM (
        SELECT
          m.id,
          COALESCE(SUM(b.quantity), 0) as stock,
          m."reorderLevel"
        FROM "Medicine" m
        LEFT JOIN "InventoryBatch" b
          ON b."medicineId" = m.id
          AND b."deletedAt" IS NULL
          AND b.quantity > 0
        WHERE m."tenantId" = ${tenantId}
          AND m."deletedAt" IS NULL
        GROUP BY m.id, m."reorderLevel"
      ) x
      WHERE stock <= COALESCE(x."reorderLevel", 0)
    `;
    return Number(Array.isArray(result) ? result[0]?.count || 0 : result?.count || 0);
  }

  async getExpiringCount(tenantId, days = 30, branchId = null) {
    const branchCondition = branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.sql``;
    const result = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count
      FROM "InventoryBatch"
      WHERE "tenantId" = ${tenantId}
        AND "deletedAt" IS NULL
        AND quantity > 0
        AND status != 'EXPIRED'
        AND status != 'ARCHIVED'
        AND "expiryDate" >= NOW()
        AND "expiryDate" < NOW() + INTERVAL '1 day' * ${days}
        ${branchCondition}
    `;
    return Number(Array.isArray(result) ? result[0]?.count || 0 : result?.count || 0);
  }

  async getExpiring30Count(tenantId, branchId = null) {
    return this.getExpiringCount(tenantId, 30, branchId);
  }

  async getExpiredProductCount(tenantId, branchId = null) {
    const now = new Date();
    const where = {
      tenantId,
      OR: [{ expiryDate: { lt: now } }, { status: 'EXPIRED' }],
      quantity: { gt: 0 },
      deletedAt: null,
    };
    if (branchId) where.branchId = branchId;
    return prisma.inventoryBatch.count({ where });
  }

  async getInventoryValue(tenantId, branchId = null) {
    const branchCondition = branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.sql``;
    const result = await prisma.$queryRaw`
      SELECT COALESCE(SUM(quantity * "purchasePrice"), 0) as value
      FROM "InventoryBatch"
      WHERE "tenantId" = ${tenantId}
        AND "deletedAt" IS NULL
        ${branchCondition}
    `;
    return Number(Array.isArray(result) ? result[0]?.value || 0 : result?.value || 0);
  }

  async getSupplierCount(tenantId) {
    return prisma.supplier.count({
      where: { tenantId, deletedAt: null },
    });
  }
}

export default new AnalyticsRepository();
