import prisma from './src/config/prisma.js';

async function main() {
  try {
    const suppliers = await prisma.supplier.findMany({
      take: 5,
      select: {
        id: true,
        supplierCode: true,
        name: true,
        drugCategories: true,
        supplierType: true,
        contactPerson: true,
        phone: true,
        email: true,
        gstNumber: true,
        address: true,
        notes: true,
        status: true,
        isPreferred: true,
        rating: true,
        leadTimeDays: true,
        paymentTermsDays: true,
        _count: { select: { purchaseOrders: true } },
        metrics: { select: { qualityScore: true, reliabilityScore: true } },
      }
    });
    console.log('Success:', suppliers.length);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
