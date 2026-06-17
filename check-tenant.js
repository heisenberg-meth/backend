import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const invoiceNullTenants =
    await prisma.$queryRaw`SELECT COUNT(*) FROM "Invoice" WHERE "tenantId" IS NULL;`;
  const inventoryNullTenants =
    await prisma.$queryRaw`SELECT COUNT(*) FROM "Inventory" WHERE "tenantId" IS NULL;`;
  const medicineNullTenants =
    await prisma.$queryRaw`SELECT COUNT(*) FROM "Medicine" WHERE "tenantId" IS NULL;`;

  console.log('Invoice null tenants:', invoiceNullTenants);
  console.log('Inventory null tenants:', inventoryNullTenants);
  console.log('Medicine null tenants:', medicineNullTenants);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
