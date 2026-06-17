import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

async function repairSalesMismatches() {
  console.log('\n🔧 REPAIRING SALES MISMATCHES...');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE REPAIR'}`);

  const mismatchedInvoices = await prisma.$queryRaw`
    SELECT 
      i."id" AS "invoiceId",
      i."invoiceNumber",
      i."tenantId",
      i."totalAmount" AS "invoiceTotal",
      COALESCE(SUM(ii."totalPrice"), 0) AS "itemsTotal",
      ABS(i."totalAmount" - COALESCE(SUM(ii."totalPrice"), 0)) AS "difference"
    FROM "Invoice" i
    LEFT JOIN "InvoiceItem" ii ON ii."invoiceId" = i."id"
    WHERE i."deletedAt" IS NULL
    GROUP BY i."id", i."invoiceNumber", i."tenantId", i."totalAmount"
    HAVING ABS(i."totalAmount" - COALESCE(SUM(ii."totalPrice"), 0)) > 0.01
    ORDER BY ABS(i."totalAmount" - COALESCE(SUM(ii."totalPrice"), 0)) DESC
  `;

  if (mismatchedInvoices.length === 0) {
    console.log('   ✅ No sales mismatches to repair');
    return;
  }

  console.log(`   Found ${mismatchedInvoices.length} invoices to repair`);

  for (const inv of mismatchedInvoices) {
    console.log(`\n   Invoice ${inv.invoiceNumber}:`);
    console.log(`     Current total: ₹${inv.invoiceTotal}`);
    console.log(`     Items total:   ₹${inv.itemsTotal}`);
    console.log(`     Difference:    ₹${inv.difference}`);

    if (!DRY_RUN) {
      // Recalculate the correct total from items
      const items = await prisma.invoiceItem.findMany({
        where: { invoiceId: inv.invoiceId },
      });

      let correctSubtotal = 0;
      let correctGst = 0;
      let correctCgst = 0;
      let correctSgst = 0;
      let correctIgst = 0;

      for (const item of items) {
        correctSubtotal += Number(item.unitPrice) * item.quantity;
        correctGst += Number(item.cgst || 0) + Number(item.sgst || 0) + Number(item.igst || 0);
        correctCgst += Number(item.cgst || 0);
        correctSgst += Number(item.sgst || 0);
        correctIgst += Number(item.igst || 0);
      }

      // Get the invoice to check discount
      const invoice = await prisma.invoice.findUnique({
        where: { id: inv.invoiceId },
      });

      const discountAmount = Number(invoice.discountAmount || 0);
      const finalTotal = correctSubtotal - discountAmount + correctGst;

      console.log(
        `     Recalculated: subtotal=₹${correctSubtotal}, gst=₹${correctGst}, discount=₹${discountAmount}, total=₹${finalTotal}`,
      );

      await prisma.invoice.update({
        where: { id: inv.invoiceId },
        data: {
          subtotal: correctSubtotal,
          gstAmount: correctGst,
          cgst: correctCgst,
          sgst: correctSgst,
          igst: correctIgst,
          totalAmount: finalTotal,
        },
      });

      // Also update linked Sale if exists
      if (invoice.saleId) {
        await prisma.sale.update({
          where: { id: invoice.saleId },
          data: {
            subtotal: correctSubtotal,
            gstAmount: correctGst,
            discountAmount: discountAmount,
            totalAmount: finalTotal,
          },
        });
        console.log(`     ✅ Updated linked Sale ${invoice.saleId}`);
      }

      console.log(`     ✅ Invoice ${inv.invoiceNumber} repaired`);
    } else {
      console.log(`     [DRY RUN] Would repair invoice ${inv.invoiceNumber}`);
    }
  }
}

async function repairPaymentStatus() {
  console.log('\n🔧 REPAIRING PAYMENT STATUS MISMATCHES...');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE REPAIR'}`);

  // Fix invoices with paidAmount=0 but status=PARTIAL (should be UNPAID)
  // But exclude zero-amount invoices which should be PAID
  const unpaidButPartial = await prisma.$queryRaw`
    SELECT 
      i."id" AS "invoiceId",
      i."invoiceNumber",
      i."tenantId",
      i."totalAmount",
      i."paidAmount",
      i."paymentStatus"
    FROM "Invoice" i
    WHERE i."deletedAt" IS NULL
      AND i."status" != 'DRAFT'
      AND i."paidAmount" = 0
      AND i."totalAmount" > 0
      AND i."paymentStatus" != 'UNPAID'
    LIMIT 200
  `;

  console.log(`   Found ${unpaidButPartial.length} invoices with paid=0 but status≠UNPAID`);

  if (!DRY_RUN && unpaidButPartial.length > 0) {
    const ids = unpaidButPartial.map((i) => i.invoiceId);
    await prisma.invoice.updateMany({
      where: { id: { in: ids } },
      data: { paymentStatus: 'UNPAID' },
    });
    console.log(`   ✅ Fixed ${unpaidButPartial.length} invoices to UNPAID`);
  } else {
    console.log(`   [DRY RUN] Would fix ${unpaidButPartial.length} invoices to UNPAID`);
  }

  // Fix invoices with paidAmount>=totalAmount but status!=PAID
  const fullyPaidButNotPaid = await prisma.$queryRaw`
    SELECT 
      i."id" AS "invoiceId",
      i."invoiceNumber",
      i."tenantId",
      i."totalAmount",
      i."paidAmount",
      i."paymentStatus"
    FROM "Invoice" i
    WHERE i."deletedAt" IS NULL
      AND i."status" != 'DRAFT'
      AND i."paidAmount" >= i."totalAmount"
      AND i."paymentStatus" != 'PAID'
    LIMIT 200
  `;

  console.log(`   Found ${fullyPaidButNotPaid.length} invoices with paid>=total but status≠PAID`);

  if (!DRY_RUN && fullyPaidButNotPaid.length > 0) {
    const ids = fullyPaidButNotPaid.map((i) => i.invoiceId);
    await prisma.invoice.updateMany({
      where: { id: { in: ids } },
      data: { paymentStatus: 'PAID' },
    });
    console.log(`   ✅ Fixed ${fullyPaidButNotPaid.length} invoices to PAID`);
  } else {
    console.log(`   [DRY RUN] Would fix ${fullyPaidButNotPaid.length} invoices to PAID`);
  }
}

async function repairOutstandingBalances() {
  console.log('\n🔧 REPAIRING OUTSTANDING BALANCE MISMATCHES...');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE REPAIR'}`);

  const supplierBalances = await prisma.$queryRaw`
    SELECT 
      s."id" AS "supplierId",
      s."name" AS "supplierName",
      s."tenantId",
      s."outstandingBalance" AS "recordedBalance",
      COALESCE(SUM(pi."balanceAmount"), 0) AS "calculatedBalance"
    FROM "Supplier" s
    LEFT JOIN "PurchaseInvoice" pi ON pi."supplierId" = s."id" AND pi."balanceAmount" > 0
    GROUP BY s."id", s."name", s."tenantId", s."outstandingBalance"
    HAVING ABS(s."outstandingBalance" - COALESCE(SUM(pi."balanceAmount"), 0)) > 0.01
  `;

  console.log(`   Found ${supplierBalances.length} suppliers with balance mismatches`);

  for (const sup of supplierBalances) {
    console.log(`\n   Supplier "${sup.supplierName}":`);
    console.log(`     Recorded:  ₹${sup.recordedBalance}`);
    console.log(`     Calculated: ₹${sup.calculatedBalance}`);

    if (!DRY_RUN) {
      await prisma.supplier.update({
        where: { id: sup.supplierId },
        data: { outstandingBalance: sup.calculatedBalance },
      });
      console.log(`     ✅ Updated supplier outstanding balance`);
    } else {
      console.log(`     [DRY RUN] Would update supplier outstanding balance`);
    }
  }
}

async function repairDashboardRevenue() {
  console.log('\n🔧 REPAIRING DASHBOARD REVENUE MISMATCHES...');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE REPAIR'}`);

  const dashboardMismatches = await prisma.$queryRaw`
    SELECT 
      dss."id",
      dss."tenantId",
      dss."salesDate",
      dss."branchId",
      dss."totalSales" AS "dashboardTotal",
      COALESCE(SUM(i."totalAmount"), 0) AS "actualTotal",
      COALESCE(SUM(i."gstAmount"), 0) AS "actualGst",
      COALESCE(SUM(i."discountAmount"), 0) AS "actualDiscount",
      COUNT(i."id") AS "invoiceCount"
    FROM "DailySalesSummary" dss
    LEFT JOIN "Invoice" i ON i."tenantId" = dss."tenantId" 
      AND i."branchId" = dss."branchId"
      AND DATE(i."createdAt") = dss."salesDate"
      AND i."deletedAt" IS NULL
      AND i."status" IN ('FINALIZED', 'PAID', 'PARTIALLY_REFUNDED')
    GROUP BY dss."id", dss."tenantId", dss."salesDate", dss."branchId", dss."totalSales"
    HAVING ABS(dss."totalSales" - COALESCE(SUM(i."totalAmount"), 0)) > 1
  `;

  console.log(`   Found ${dashboardMismatches.length} dashboard mismatches`);

  for (const d of dashboardMismatches) {
    console.log(`\n   Date ${d.salesDate}:`);
    console.log(`     Dashboard: ₹${d.dashboardTotal}`);
    console.log(`     Actual:    ₹${d.actualTotal}`);
    console.log(`     Difference: ₹${Math.abs(d.dashboardTotal - d.actualTotal)}`);

    if (!DRY_RUN) {
      await prisma.dailySalesSummary.update({
        where: { id: d.id },
        data: {
          totalSales: d.actualTotal,
          totalGst: d.actualGst,
          totalDiscount: d.actualDiscount,
          totalInvoices: parseInt(d.invoiceCount),
        },
      });
      console.log(`     ✅ Updated DailySalesSummary`);
    } else {
      console.log(`     [DRY RUN] Would update DailySalesSummary`);
    }
  }
}

async function main() {
  console.log('🏦 PHASE 5: CRITICAL ISSUES REPAIR');
  console.log('='.repeat(80));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE REPAIR'}`);

  try {
    await repairSalesMismatches();
    await repairPaymentStatus();
    await repairOutstandingBalances();
    await repairDashboardRevenue();
  } catch (error) {
    console.error('Repair failed:', error);
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ REPAIR COMPLETE');
  console.log('='.repeat(80));
  console.log(`Completed at: ${new Date().toISOString()}`);
}

main();
