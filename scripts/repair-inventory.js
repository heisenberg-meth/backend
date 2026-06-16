import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting inventory integrity repair...');

  const result = await prisma.$executeRaw`
    WITH BatchTotals AS (
      SELECT 
        "tenantId", 
        "branchId", 
        "medicineId", 
        SUM("quantity") as actual_stock
      FROM "InventoryBatch"
      WHERE "deletedAt" IS NULL
      GROUP BY "tenantId", "branchId", "medicineId"
    )
    UPDATE "Inventory" i
    SET "currentStock" = COALESCE(sub.actual_stock, 0)
    FROM (
      SELECT i."id", bt.actual_stock
      FROM "Inventory" i
      LEFT JOIN BatchTotals bt 
        ON i."tenantId" = bt."tenantId" 
        AND (i."branchId" = bt."branchId" OR (i."branchId" IS NULL AND bt."branchId" IS NULL))
        AND i."medicineId" = bt."medicineId"
      WHERE i."currentStock" != COALESCE(bt.actual_stock, 0)
    ) sub
    WHERE i."id" = sub."id";
  `;

  console.log(`Updated ${result} rows in Inventory table.`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
