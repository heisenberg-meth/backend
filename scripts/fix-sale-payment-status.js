/**
 * One-time migration: Fix sale paymentStatus for all completed sales
 * where paymentMethod is CASH/UPI/CARD but paymentStatus is incorrectly PENDING.
 *
 * Run with: node scripts/fix-sale-payment-status.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  console.log('🔍 Scanning for incorrectly-flagged PENDING sales...');

  const affected = await prisma.sale.findMany({
    where: {
      paymentStatus: 'PENDING',
      paymentMethod: { in: ['CASH', 'UPI', 'CARD'] },
      status: 'COMPLETED',
    },
    select: { id: true, paymentMethod: true, totalAmount: true },
  });

  console.log(`Found ${affected.length} sale(s) to fix.`);

  if (affected.length === 0) {
    console.log('✅ Nothing to migrate.');
    await prisma.$disconnect();
    return;
  }

  const ids = affected.map((s) => s.id);

  const result = await prisma.sale.updateMany({
    where: { id: { in: ids } },
    data: { paymentStatus: 'PAID' },
  });

  console.log(`✅ Updated ${result.count} sale(s) to paymentStatus = PAID.`);

  // Also fix corresponding Invoices where paymentStatus is still UNPAID but sale was CASH/UPI/CARD
  const invoiceIds = await prisma.sale.findMany({
    where: { id: { in: ids } },
    select: { invoiceId: true },
  });

  const validInvoiceIds = invoiceIds.map((s) => s.invoiceId).filter(Boolean);
  if (validInvoiceIds.length > 0) {
    const invResult = await prisma.invoice.updateMany({
      where: {
        id: { in: validInvoiceIds },
        paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
      },
      data: { paymentStatus: 'PAID' },
    });
    console.log(`✅ Updated ${invResult.count} invoice(s) to paymentStatus = PAID.`);
  }

  await prisma.$disconnect();
  console.log('🎉 Migration complete.');
}

run().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
