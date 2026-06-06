import prisma from '../src/config/prisma.js';

async function main() {
  console.log('Fetching finalized/paid invoices without Sale records...');

  const invoices = await prisma.invoice.findMany({
    where: {
      saleId: null,
      status: { in: ['FINALIZED', 'PAID'] },
    },
    include: {
      items: true,
      payments: { take: 1, orderBy: { createdAt: 'desc' } },
    },
  });

  console.log(`Found ${invoices.length} invoices to backfill.`);

  for (const invoice of invoices) {
    try {
      const paymentMethod = invoice.payments[0]?.paymentMode || 'CASH';
      const paymentStatus = invoice.paymentStatus === 'PAID' ? 'PAID' : 'PENDING';

      const sale = await prisma.sale.create({
        data: {
          tenantId: invoice.tenantId,
          branchId: invoice.branchId,
          invoiceId: invoice.id,
          totalItems: invoice.items.reduce((sum, i) => sum + i.quantity, 0),
          subtotal: invoice.subtotal,
          discountAmount: invoice.discountAmount,
          gstAmount: invoice.gstAmount,
          totalAmount: invoice.totalAmount,
          paymentMethod,
          soldBy: invoice.createdBy,
          soldAt: invoice.createdAt,
          patientId: invoice.patientId,
          paymentStatus,
          status: 'COMPLETED',
        },
      });

      for (const item of invoice.items) {
        const gstAmount = (Number(item.cgst) || 0) + (Number(item.igst) || 0) + (Number(item.sgst) || 0);
        await prisma.saleItem.create({
          data: {
            saleId: sale.id,
            medicineId: item.medicineId,
            batchId: item.batchId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            gstAmount,
            totalAmount: item.totalPrice,
          },
        });
      }

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { saleId: sale.id },
      });

      console.log(`  OK: ${invoice.invoiceNumber} -> sale ${sale.id}`);
    } catch (err) {
      console.error(`  FAIL: ${invoice.invoiceNumber} (${invoice.id}): ${err.message}`);
    }
  }

  console.log('\nDone.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
