import { Prisma } from '@prisma/client';
import prisma from '../../../config/prisma.js';

class AnalyticsService {
  async getTenantKPIs(tenantId) {
    const [totalSku, lowStock, expiring30Days, inventoryValue, supplierCount] =
      await Promise.all([
        prisma.medicine.count({
          where: { tenantId, deletedAt: null },
        }),

        prisma.$queryRaw`
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
        `,

        prisma.$queryRaw`
          SELECT COUNT(*)::int as count
          FROM "InventoryBatch"
          WHERE "tenantId" = ${tenantId}
            AND "deletedAt" IS NULL
            AND quantity > 0
            AND status = 'ACTIVE'
            AND "expiryDate" BETWEEN NOW() AND NOW() + INTERVAL '30 days'
        `,

        prisma.$queryRaw`
          SELECT COALESCE(SUM(quantity * "purchasePrice"), 0) as value
          FROM "InventoryBatch"
          WHERE "tenantId" = ${tenantId}
            AND "deletedAt" IS NULL
        `,

        prisma.supplier.count({
          where: { tenantId, deletedAt: null },
        }),
      ]);

    return {
      totalSku: Number(totalSku || 0),
      lowStock: Number(Array.isArray(lowStock) ? lowStock[0]?.count || 0 : lowStock?.count || 0),
      expiring30Days: Number(
        Array.isArray(expiring30Days) ? expiring30Days[0]?.count || 0 : expiring30Days?.count || 0,
      ),
      inventoryValue: Number(
        Array.isArray(inventoryValue)
          ? inventoryValue[0]?.value || 0
          : inventoryValue?.value || 0,
      ),
      supplierCount: Number(supplierCount || 0),
    };
  }
}

export default new AnalyticsService();
