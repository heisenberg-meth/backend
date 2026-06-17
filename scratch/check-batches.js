import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tenantId = '4fad6382-e3a8-49c8-88ef-501d5c489131';
  const now = new Date();

  const total = await prisma.inventoryBatch.count({
    where: { tenantId },
  });
  console.log('Total batches for tenant:', total);

  const rawExpired = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count
    FROM "InventoryBatch"
    WHERE "tenantId" = ${tenantId}
      AND "deletedAt" IS NULL
      AND quantity > 0
      AND ("expiryDate" < NOW() OR status = 'EXPIRED')
  `;
  console.log('Raw expired count:', rawExpired[0]?.count);

  const prismaExpired = await prisma.inventoryBatch.count({
    where: {
      tenantId,
      OR: [{ expiryDate: { lt: now } }, { status: 'EXPIRED' }],
      status: { not: 'ARCHIVED' },
      quantity: { gt: 0 },
      deletedAt: null,
      medicine: { deletedAt: null },
    },
  });
  console.log('Prisma expired count:', prismaExpired);

  const prismaExpiredNoMedicineCheck = await prisma.inventoryBatch.count({
    where: {
      tenantId,
      OR: [{ expiryDate: { lt: now } }, { status: 'EXPIRED' }],
      status: { not: 'ARCHIVED' },
      quantity: { gt: 0 },
      deletedAt: null,
    },
  });
  console.log('Prisma expired count (no medicine check):', prismaExpiredNoMedicineCheck);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
