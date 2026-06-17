import prisma from '../src/config/prisma.js';

async function main() {
  const tenant = await prisma.tenant.findFirst();
  console.log('Tenant:', tenant);

  const now = new Date();
  console.log('Current Time:', now);

  const totalBatches = await prisma.inventoryBatch.count({
    where: { deletedAt: null },
  });
  console.log('Total Batches in DB:', totalBatches);

  const expiredBatches = await prisma.inventoryBatch.findMany({
    where: {
      deletedAt: null,
      quantity: { gt: 0 },
    },
    include: {
      medicine: true,
    },
    orderBy: { expiryDate: 'asc' },
    take: 10,
  });

  console.log('Top 10 Batches (quantity > 0):');
  for (const b of expiredBatches) {
    console.log({
      id: b.id,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate,
      status: b.status,
      quantity: b.quantity,
      branchId: b.branchId,
      tenantId: b.tenantId,
      medicineName: b.medicine?.name,
      medicineDeleted: b.medicine?.deletedAt,
      medicineIsActive: b.medicine?.isActive,
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
