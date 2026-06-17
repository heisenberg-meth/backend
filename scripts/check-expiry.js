import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkExpiry() {
  const tenantId = '4fad6382-e3a8-49c8-88ef-501d5c489131';
  
  // Check raw expired batches
  const rawExpired = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count
    FROM "InventoryBatch"
    WHERE "tenantId" = ${tenantId}
      AND "deletedAt" IS NULL
      AND quantity > 0
      AND "expiryDate" < NOW()
  `;
  console.log('Raw expired (expiryDate < NOW()):', rawExpired[0].count);

  // Check status EXPIRED
  const statusExpired = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count
    FROM "InventoryBatch"
    WHERE "tenantId" = ${tenantId}
      AND "deletedAt" IS NULL
      AND quantity > 0
      AND status = 'EXPIRED'
  `;
  console.log('Status EXPIRED:', statusExpired[0].count);

  // Check combined (OR)
  const combinedExpired = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count
    FROM "InventoryBatch"
    WHERE "tenantId" = ${tenantId}
      AND "deletedAt" IS NULL
      AND quantity > 0
      AND ("expiryDate" < NOW() OR status = 'EXPIRED')
  `;
  console.log('Combined (expiryDate < NOW() OR status=EXPIRED):', combinedExpired[0].count);

  // Check what the Prisma query would return
  const prismaExpired = await prisma.inventoryBatch.count({
    where: {
      tenantId,
      OR: [{ expiryDate: { lt: new Date() } }, { status: 'EXPIRED' }],
      quantity: { gt: 0 },
      deletedAt: null,
    },
  });
  console.log('Prisma count:', prismaExpired);

  // Sample some expired batches
  const samples = await prisma.$queryRaw`
    SELECT id, "batchNumber", status, quantity, "expiryDate"
    FROM "InventoryBatch"
    WHERE "tenantId" = ${tenantId}
      AND "deletedAt" IS NULL
      AND quantity > 0
      AND "expiryDate" < NOW()
    LIMIT 5
  `;
  console.log('Sample expired batches:', samples);

  await prisma.$disconnect();
}

checkExpiry();
