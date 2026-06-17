import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const mismatches = await prisma.$queryRaw`
    SELECT
    i."medicineId",
    i."currentStock",
    SUM(b."availableQuantity") AS batch_stock
    FROM "Inventory" i
    JOIN "InventoryBatch" b
    ON b."medicineId" = i."medicineId"
    GROUP BY i."medicineId", i."currentStock"
    HAVING i."currentStock" <> COALESCE(SUM(b."availableQuantity"), 0);
  `;
  console.log('Mismatches:', mismatches);

  const negatives = await prisma.$queryRaw`
    SELECT *
    FROM "InventoryBatch"
    WHERE "availableQuantity" < 0;
  `;
  console.log('Negative Stock:', negatives);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
