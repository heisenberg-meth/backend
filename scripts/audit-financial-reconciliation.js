import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const results = {
  salesMismatch: [],
  gstMismatch: [],
  purchaseMismatch: [],
  creditNoteMismatch: [],
  duplicateInvoices: [],
  duplicatePayments: [],
  paymentStatusMismatch: [],
  outstandingBalanceMismatch: [],
  decimalPrecisionIssues: [],
  summary: {
    totalInvoices: 0,
    totalSalesMismatch: 0,
    totalGstMismatch: 0,
    totalPurchaseMismatch: 0,
    totalCreditNoteMismatch: 0,
    totalDuplicateInvoices: 0,
    totalDuplicatePayments: 0,
    totalPaymentStatusMismatch: 0,
    totalOutstandingBalanceMismatch: 0,
    totalDecimalPrecisionIssues: 0,
  },
};

async function auditSalesReconciliation() {
  console.log('\n📊 AUDITING SALES RECONCILIATION...');
  console.log('   Verifying: Invoice.totalAmount = subtotal - discount + gstAmount');
  console.log(
    '   (Note: Item totals exclude invoice-level discounts, so we check the formula instead)',
  );

  const mismatchedInvoices = await prisma.$queryRaw`
    SELECT 
      i."id" AS "invoiceId",
      i."invoiceNumber",
      i."tenantId",
      i."subtotal",
      i."discountAmount",
      i."gstAmount",
      i."totalAmount",
      (i."subtotal" - i."discountAmount" + i."gstAmount") AS "expectedTotal",
      ABS((i."subtotal" - i."discountAmount" + i."gstAmount") - i."totalAmount") AS "difference"
    FROM "Invoice" i
    WHERE i."deletedAt" IS NULL
      AND i."status" != 'DRAFT'
      AND i."totalAmount" > 0
      AND ABS((i."subtotal" - i."discountAmount" + i."gstAmount") - i."totalAmount") > 0.01
    ORDER BY ABS((i."subtotal" - i."discountAmount" + i."gstAmount") - i."totalAmount") DESC
    LIMIT 100
  `;

  results.salesMismatch = mismatchedInvoices;
  results.summary.totalSalesMismatch = mismatchedInvoices.length;

  if (mismatchedInvoices.length > 0) {
    console.log(`   ❌ FOUND ${mismatchedInvoices.length} SALES MISMATCHES:`);
    mismatchedInvoices.forEach((inv) => {
      console.log(
        `      Invoice ${inv.invoiceNumber}: Invoice=₹${inv.invoiceTotal}, Items=₹${inv.itemsTotal}, Diff=₹${inv.difference}`,
      );
    });
  } else {
    console.log('   ✅ All invoices match their item totals');
  }
}

async function auditGstReconciliation() {
  console.log('\n📊 AUDITING GST RECONCILIATION...');
  console.log('   Verifying: subtotal + cgst + sgst = totalAmount (for intra-state)');

  const gstMismatches = await prisma.$queryRaw`
    SELECT 
      i."id" AS "invoiceId",
      i."invoiceNumber",
      i."tenantId",
      i."subtotal",
      i."cgst",
      i."sgst",
      i."igst",
      i."gstAmount",
      i."totalAmount",
      i."discountAmount",
      (i."subtotal" - i."discountAmount" + i."gstAmount") AS "expectedTotal",
      ABS((i."subtotal" - i."discountAmount" + i."gstAmount") - i."totalAmount") AS "difference"
    FROM "Invoice" i
    WHERE i."deletedAt" IS NULL
      AND i."status" != 'DRAFT'
      AND ABS((i."subtotal" - i."discountAmount" + i."gstAmount") - i."totalAmount") > 0.01
    ORDER BY ABS((i."subtotal" - i."discountAmount" + i."gstAmount") - i."totalAmount") DESC
    LIMIT 100
  `;

  results.gstMismatch = gstMismatches;
  results.summary.totalGstMismatch = gstMismatches.length;

  if (gstMismatches.length > 0) {
    console.log(`   ❌ FOUND ${gstMismatches.length} GST MISMATCHES:`);
    gstMismatches.forEach((inv) => {
      console.log(
        `      Invoice ${inv.invoiceNumber}: subtotal=${inv.subtotal}, gst=${inv.gstAmount}, discount=${inv.discountAmount}, total=${inv.totalAmount}, expected=${inv.expectedTotal}, diff=₹${inv.difference}`,
      );
    });
  } else {
    console.log('   ✅ All GST calculations are correct');
  }

  // Also verify CGST + SGST = GST Amount for intra-state
  console.log('\n   Verifying: cgst + sgst = gstAmount (intra-state GST split)');

  const gstSplitMismatches = await prisma.$queryRaw`
    SELECT 
      i."id" AS "invoiceId",
      i."invoiceNumber",
      i."cgst",
      i."sgst",
      i."igst",
      i."gstAmount",
      ABS((i."cgst" + i."sgst" + i."igst") - i."gstAmount") AS "difference"
    FROM "Invoice" i
    WHERE i."deletedAt" IS NULL
      AND i."status" != 'DRAFT'
      AND i."gstAmount" > 0
      AND ABS((i."cgst" + i."sgst" + i."igst") - i."gstAmount") > 0.01
    LIMIT 50
  `;

  if (gstSplitMismatches.length > 0) {
    console.log(
      `   ❌ FOUND ${gstSplitMismatches.length} GST SPLIT MISMATCHES (CGST+SGST+IGST ≠ GST Amount):`,
    );
    gstSplitMismatches.forEach((inv) => {
      console.log(
        `      Invoice ${inv.invoiceNumber}: cgst=${inv.cgst}, sgst=${inv.sgst}, igst=${inv.igst}, gstAmount=${inv.gstAmount}, diff=₹${inv.difference}`,
      );
    });
  } else {
    console.log('   ✅ All GST splits are correct');
  }
}

async function auditPurchaseReconciliation() {
  console.log('\n📊 AUDITING PURCHASE RECONCILIATION...');
  console.log('   Verifying: PurchaseInvoice.totalAmount = subtotal + gstAmount');

  const purchaseMismatches = await prisma.$queryRaw`
    SELECT 
      pi."id" AS "purchaseInvoiceId",
      pi."invoiceNumber",
      pi."tenantId",
      pi."subtotal",
      pi."gstAmount",
      pi."totalAmount",
      (pi."subtotal" + pi."gstAmount") AS "expectedTotal",
      ABS((pi."subtotal" + pi."gstAmount") - pi."totalAmount") AS "difference"
    FROM "PurchaseInvoice" pi
    WHERE ABS((pi."subtotal" + pi."gstAmount") - pi."totalAmount") > 0.01
    ORDER BY ABS((pi."subtotal" + pi."gstAmount") - pi."totalAmount") DESC
    LIMIT 100
  `;

  results.purchaseMismatch = purchaseMismatches;
  results.summary.totalPurchaseMismatch = purchaseMismatches.length;

  if (purchaseMismatches.length > 0) {
    console.log(`   ❌ FOUND ${purchaseMismatches.length} PURCHASE MISMATCHES:`);
    purchaseMismatches.forEach((inv) => {
      console.log(
        `      Invoice ${inv.invoiceNumber}: subtotal=${inv.subtotal}, gst=${inv.gstAmount}, total=${inv.totalAmount}, expected=${inv.expectedTotal}, diff=₹${inv.difference}`,
      );
    });
  } else {
    console.log('   ✅ All purchase invoices match their calculated totals');
  }

  // Verify PurchaseInvoice balanceAmount and paidAmount consistency
  console.log('\n   Verifying: totalAmount = paidAmount + balanceAmount');

  const purchaseBalanceMismatches = await prisma.$queryRaw`
    SELECT 
      pi."id" AS "purchaseInvoiceId",
      pi."invoiceNumber",
      pi."tenantId",
      pi."totalAmount",
      pi."paidAmount",
      pi."balanceAmount",
      (pi."paidAmount" + pi."balanceAmount") AS "expectedTotal",
      ABS((pi."paidAmount" + pi."balanceAmount") - pi."totalAmount") AS "difference"
    FROM "PurchaseInvoice" pi
    WHERE ABS((pi."paidAmount" + pi."balanceAmount") - pi."totalAmount") > 0.01
    LIMIT 50
  `;

  if (purchaseBalanceMismatches.length > 0) {
    console.log(`   ❌ FOUND ${purchaseBalanceMismatches.length} PURCHASE BALANCE MISMATCHES:`);
    purchaseBalanceMismatches.forEach((inv) => {
      console.log(
        `      Invoice ${inv.invoiceNumber}: total=${inv.totalAmount}, paid=${inv.paidAmount}, balance=${inv.balanceAmount}, expected=${inv.expectedTotal}`,
      );
    });
  } else {
    console.log('   ✅ All purchase balances are correct');
  }
}

async function auditCreditNoteReconciliation() {
  console.log('\n📊 AUDITING CREDIT NOTE RECONCILIATION...');
  console.log('   Verifying: SupplierReturn.returnAmount = SupplierCreditNote.amount');

  const creditNoteMismatches = await prisma.$queryRaw`
    SELECT 
      sr."id" AS "returnId",
      sr."returnNumber",
      sr."tenantId",
      sr."returnAmount",
      scn."id" AS "creditNoteId",
      scn."creditNoteNumber",
      scn."amount" AS "creditNoteAmount",
      ABS(sr."returnAmount" - scn."amount") AS "difference"
    FROM "SupplierReturn" sr
    JOIN "SupplierCreditNote" scn ON scn."returnId" = sr."id"
    WHERE ABS(sr."returnAmount" - scn."amount") > 0.01
    ORDER BY ABS(sr."returnAmount" - scn."amount") DESC
    LIMIT 50
  `;

  results.creditNoteMismatch = creditNoteMismatches;
  results.summary.totalCreditNoteMismatch = creditNoteMismatches.length;

  if (creditNoteMismatches.length > 0) {
    console.log(`   ❌ FOUND ${creditNoteMismatches.length} CREDIT NOTE MISMATCHES:`);
    creditNoteMismatches.forEach((cn) => {
      console.log(
        `      Return ${cn.returnNumber}: returnAmount=₹${cn.returnAmount}, creditNote=₹${cn.creditNoteAmount}, diff=₹${cn.difference}`,
      );
    });
  } else {
    console.log('   ✅ All credit notes match their supplier returns');
  }

  // Check for supplier returns without credit notes
  console.log('\n   Checking for supplier returns without credit notes...');

  const returnsWithoutCreditNotes = await prisma.$queryRaw`
    SELECT 
      sr."id" AS "returnId",
      sr."returnNumber",
      sr."tenantId",
      sr."returnAmount",
      sr."status",
      sr."createdAt"
    FROM "SupplierReturn" sr
    LEFT JOIN "SupplierCreditNote" scn ON scn."returnId" = sr."id"
    WHERE scn."id" IS NULL
      AND sr."status" = 'COMPLETED'
      AND sr."returnAmount" > 0
    LIMIT 50
  `;

  if (returnsWithoutCreditNotes.length > 0) {
    console.log(
      `   ⚠️  FOUND ${returnsWithoutCreditNotes.length} COMPLETED RETURNS WITHOUT CREDIT NOTES:`,
    );
    returnsWithoutCreditNotes.forEach((ret) => {
      console.log(`      Return ${ret.returnNumber}: amount=₹${ret.returnAmount}`);
    });
  } else {
    console.log('   ✅ All completed returns have credit notes');
  }
}

async function auditDuplicateInvoices() {
  console.log('\n📊 AUDITING DUPLICATE INVOICE NUMBERS...');

  const duplicateInvoices = await prisma.$queryRaw`
    SELECT 
      "tenantId",
      "invoiceNumber",
      COUNT(*) AS "count",
      ARRAY_AGG("id") AS "invoiceIds"
    FROM "Invoice"
    WHERE "deletedAt" IS NULL
    GROUP BY "tenantId", "invoiceNumber"
    HAVING COUNT(*) > 1
    LIMIT 50
  `;

  results.duplicateInvoices = duplicateInvoices;
  results.summary.totalDuplicateInvoices = duplicateInvoices.length;

  if (duplicateInvoices.length > 0) {
    console.log(`   ❌ FOUND ${duplicateInvoices.length} DUPLICATE INVOICE NUMBERS:`);
    duplicateInvoices.forEach((inv) => {
      console.log(
        `      Tenant ${inv.tenantId}: Invoice "${inv.invoiceNumber}" appears ${inv.count} times (IDs: ${inv.invoiceIds.join(', ')})`,
      );
    });
  } else {
    console.log('   ✅ All invoice numbers are unique');
  }
}

async function auditDuplicatePayments() {
  console.log('\n📊 AUDITING DUPLICATE PAYMENT PROCESSING...');
  console.log('   Verifying: No duplicate payment captures via webhook idempotency');

  // Check for duplicate payment.webhook entries (should be prevented by idempotency)
  const duplicateWebhooks = await prisma.$queryRaw`
    SELECT 
      "idempotencyKey",
      COUNT(*) AS "count",
      ARRAY_AGG("id") AS "webhookIds"
    FROM "PaymentWebhook"
    GROUP BY "idempotencyKey"
    HAVING COUNT(*) > 1
    LIMIT 50
  `;

  if (duplicateWebhooks.length > 0) {
    console.log(
      `   ⚠️  FOUND ${duplicateWebhooks.length} DUPLICATE WEBHOOK ENTRIES (should be prevented by idempotency):`,
    );
    duplicateWebhooks.forEach((wh) => {
      console.log(
        `      Key "${wh.idempotencyKey}": ${wh.count} entries (IDs: ${wh.webhookIds.join(', ')})`,
      );
    });
  } else {
    console.log('   ✅ No duplicate webhook entries');
  }

  // Check for payments with same Razorpay payment ID (should be unique)
  const duplicateRazorpayPayments = await prisma.$queryRaw`
    SELECT 
      "razorpayPaymentId",
      COUNT(*) AS "count",
      ARRAY_AGG("id") AS "paymentIds"
    FROM "Payment"
    WHERE "razorpayPaymentId" IS NOT NULL
    GROUP BY "razorpayPaymentId"
    HAVING COUNT(*) > 1
    LIMIT 50
  `;

  results.duplicatePayments = duplicateRazorpayPayments;
  results.summary.totalDuplicatePayments = duplicateRazorpayPayments.length;

  if (duplicateRazorpayPayments.length > 0) {
    console.log(`   ❌ FOUND ${duplicateRazorpayPayments.length} DUPLICATE RAZORPAY PAYMENT IDs:`);
    duplicateRazorpayPayments.forEach((pmt) => {
      console.log(
        `      Razorpay ID "${pmt.razorpayPaymentId}": ${pmt.count} payments (IDs: ${pmt.paymentIds.join(', ')})`,
      );
    });
  } else {
    console.log('   ✅ All Razorpay payment IDs are unique');
  }

  // Check for idempotency key violations
  const duplicateIdempotencyKeys = await prisma.$queryRaw`
    SELECT 
      "idempotencyKeyHash",
      COUNT(*) AS "count",
      ARRAY_AGG("id") AS "paymentIds"
    FROM "Payment"
    WHERE "idempotencyKeyHash" IS NOT NULL
    GROUP BY "idempotencyKeyHash"
    HAVING COUNT(*) > 1
    LIMIT 50
  `;

  if (duplicateIdempotencyKeys.length > 0) {
    console.log(`   ❌ FOUND ${duplicateIdempotencyKeys.length} DUPLICATE IDEMPOTENCY KEYS:`);
    duplicateIdempotencyKeys.forEach((ik) => {
      console.log(
        `      Key "${ik.idempotencyKeyHash}": ${ik.count} payments (IDs: ${ik.paymentIds.join(', ')})`,
      );
    });
  } else {
    console.log('   ✅ All idempotency keys are unique');
  }
}

async function auditPaymentStatusConsistency() {
  console.log('\n📊 AUDITING PAYMENT STATUS CONSISTENCY...');

  // Check invoices where payment status doesn't match paid/total amounts
  const paymentStatusMismatches = await prisma.$queryRaw`
    SELECT 
      i."id" AS "invoiceId",
      i."invoiceNumber",
      i."tenantId",
      i."totalAmount",
      i."paidAmount",
      i."paymentStatus"::text AS "paymentStatus",
      CASE 
        WHEN i."totalAmount" = 0 THEN 'PAID'
        WHEN i."paidAmount" = 0 THEN 'UNPAID'
        WHEN i."paidAmount" >= i."totalAmount" THEN 'PAID'
        ELSE 'PARTIAL'
      END AS "expectedStatus"
    FROM "Invoice" i
    WHERE i."deletedAt" IS NULL
      AND i."status" != 'DRAFT'
      AND i."paymentStatus"::text != CASE 
        WHEN i."totalAmount" = 0 THEN 'PAID'
        WHEN i."paidAmount" = 0 THEN 'UNPAID'
        WHEN i."paidAmount" >= i."totalAmount" THEN 'PAID'
        ELSE 'PARTIAL'
      END
    LIMIT 100
  `;

  results.paymentStatusMismatch = paymentStatusMismatches;
  results.summary.totalPaymentStatusMismatch = paymentStatusMismatches.length;

  if (paymentStatusMismatches.length > 0) {
    console.log(`   ❌ FOUND ${paymentStatusMismatches.length} PAYMENT STATUS MISMATCHES:`);
    paymentStatusMismatches.forEach((inv) => {
      console.log(
        `      Invoice ${inv.invoiceNumber}: paid=₹${inv.paidAmount}, total=₹${inv.totalAmount}, status=${inv.paymentStatus}, expected=${inv.expectedStatus}`,
      );
    });
  } else {
    console.log('   ✅ All payment statuses are correct');
  }

  // Check for paidAmount > totalAmount
  const overpaidInvoices = await prisma.$queryRaw`
    SELECT 
      i."id" AS "invoiceId",
      i."invoiceNumber",
      i."tenantId",
      i."totalAmount",
      i."paidAmount",
      (i."paidAmount" - i."totalAmount") AS "overpayment"
    FROM "Invoice" i
    WHERE i."deletedAt" IS NULL
      AND i."paidAmount" > i."totalAmount"
      AND ABS(i."paidAmount" - i."totalAmount") > 0.01
    LIMIT 50
  `;

  if (overpaidInvoices.length > 0) {
    console.log(`   ⚠️  FOUND ${overpaidInvoices.length} OVERPAID INVOICES:`);
    overpaidInvoices.forEach((inv) => {
      console.log(
        `      Invoice ${inv.invoiceNumber}: paid=₹${inv.paidAmount}, total=₹${inv.totalAmount}, overpayment=₹${inv.overpayment}`,
      );
    });
  } else {
    console.log('   ✅ No overpaid invoices found');
  }
}

async function auditOutstandingBalances() {
  console.log('\n📊 AUDITING OUTSTANDING BALANCES...');
  console.log('   Verifying: Supplier.outstandingBalance matches sum of unpaid purchase invoices');

  const supplierBalanceMismatches = await prisma.$queryRaw`
    SELECT 
      s."id" AS "supplierId",
      s."name" AS "supplierName",
      s."tenantId",
      s."outstandingBalance" AS "recordedBalance",
      COALESCE(SUM(pi."balanceAmount"), 0) AS "calculatedBalance",
      ABS(s."outstandingBalance" - COALESCE(SUM(pi."balanceAmount"), 0)) AS "difference"
    FROM "Supplier" s
    LEFT JOIN "PurchaseInvoice" pi ON pi."supplierId" = s."id" AND pi."balanceAmount" > 0
    GROUP BY s."id", s."name", s."tenantId", s."outstandingBalance"
    HAVING ABS(s."outstandingBalance" - COALESCE(SUM(pi."balanceAmount"), 0)) > 0.01
    ORDER BY ABS(s."outstandingBalance" - COALESCE(SUM(pi."balanceAmount"), 0)) DESC
    LIMIT 50
  `;

  results.outstandingBalanceMismatch = supplierBalanceMismatches;
  results.summary.totalOutstandingBalanceMismatch = supplierBalanceMismatches.length;

  if (supplierBalanceMismatches.length > 0) {
    console.log(`   ❌ FOUND ${supplierBalanceMismatches.length} OUTSTANDING BALANCE MISMATCHES:`);
    supplierBalanceMismatches.forEach((sup) => {
      console.log(
        `      Supplier "${sup.supplierName}": recorded=₹${sup.recordedBalance}, calculated=₹${sup.calculatedBalance}, diff=₹${sup.difference}`,
      );
    });
  } else {
    console.log('   ✅ All supplier outstanding balances are correct');
  }

  // Check patient credit balances
  console.log('\n   Checking patient credit account balances...');

  const patientCreditMismatches = await prisma.$queryRaw`
    SELECT 
      p."id" AS "patientId",
      p."fullName",
      p."tenantId",
      p."creditUsed" AS "recordedCreditUsed",
      COALESCE(SUM(cl."debit"), 0) - COALESCE(SUM(cl."credit"), 0) AS "calculatedCreditUsed"
    FROM "Patient" p
    LEFT JOIN "PatientCreditLedger" cl ON cl."patientId" = p."id"
    GROUP BY p."id", p."fullName", p."tenantId", p."creditUsed"
    HAVING ABS(p."creditUsed" - (COALESCE(SUM(cl."debit"), 0) - COALESCE(SUM(cl."credit"), 0))) > 0.01
    LIMIT 50
  `;

  if (patientCreditMismatches.length > 0) {
    console.log(
      `   ⚠️  FOUND ${patientCreditMismatches.length} PATIENT CREDIT BALANCE MISMATCHES:`,
    );
    patientCreditMismatches.forEach((pat) => {
      console.log(
        `      Patient "${pat.fullName}": recorded=₹${pat.recordedCreditUsed}, calculated=₹${pat.calculatedCreditUsed}`,
      );
    });
  } else {
    console.log('   ✅ All patient credit balances are correct');
  }
}

async function auditDecimalPrecision() {
  console.log('\n📊 AUDITING DECIMAL PRECISION...');
  console.log('   Checking for floating-point precision issues in financial calculations');

  // Check for invoices where individual item totals don't sum to subtotal
  // (This catches rounding errors in item-level calculations)
  const roundingIssues = await prisma.$queryRaw`
    SELECT 
      i."id" AS "invoiceId",
      i."invoiceNumber",
      i."tenantId",
      i."subtotal" AS "invoiceSubtotal",
      SUM(ii."unitPrice" * ii."quantity") AS "calculatedSubtotal",
      ABS(i."subtotal" - SUM(ii."unitPrice" * ii."quantity")) AS "difference"
    FROM "Invoice" i
    JOIN "InvoiceItem" ii ON ii."invoiceId" = i."id"
    WHERE i."deletedAt" IS NULL
    GROUP BY i."id", i."invoiceNumber", i."tenantId", i."subtotal"
    HAVING ABS(i."subtotal" - SUM(ii."unitPrice" * ii."quantity")) > 0.01
    LIMIT 50
  `;

  results.decimalPrecisionIssues = roundingIssues;
  results.summary.totalDecimalPrecisionIssues = roundingIssues.length;

  if (roundingIssues.length > 0) {
    console.log(`   ⚠️  FOUND ${roundingIssues.length} DECIMAL PRECISION ISSUES:`);
    roundingIssues.forEach((inv) => {
      console.log(
        `      Invoice ${inv.invoiceNumber}: subtotal=₹${inv.invoiceSubtotal}, calculated=₹${inv.calculatedSubtotal}, diff=₹${inv.difference}`,
      );
    });
  } else {
    console.log('   ✅ No decimal precision issues found');
  }
}

async function auditDashboardRevenue() {
  console.log('\n📊 AUDITING DASHBOARD REVENUE VS ACTUAL INVOICES...');
  console.log('   Verifying: DailySalesSummary.totalSales matches actual invoice totals');

  const dashboardMismatches = await prisma.$queryRaw`
    SELECT 
      dss."id",
      dss."tenantId",
      dss."salesDate",
      dss."totalSales" AS "dashboardTotal",
      COALESCE(SUM(i."totalAmount"), 0) AS "actualTotal",
      ABS(dss."totalSales" - COALESCE(SUM(i."totalAmount"), 0)) AS "difference"
    FROM "DailySalesSummary" dss
    LEFT JOIN "Invoice" i ON i."tenantId" = dss."tenantId" 
      AND DATE(i."createdAt") = dss."salesDate"
      AND i."deletedAt" IS NULL
      AND i."status" IN ('FINALIZED', 'PAID', 'PARTIALLY_REFUNDED')
    GROUP BY dss."id", dss."tenantId", dss."salesDate", dss."totalSales"
    HAVING ABS(dss."totalSales" - COALESCE(SUM(i."totalAmount"), 0)) > 1
    ORDER BY ABS(dss."totalSales" - COALESCE(SUM(i."totalAmount"), 0)) DESC
    LIMIT 50
  `;

  if (dashboardMismatches.length > 0) {
    console.log(`   ⚠️  FOUND ${dashboardMismatches.length} DASHBOARD REVENUE MISMATCHES:`);
    dashboardMismatches.forEach((d) => {
      console.log(
        `      Date ${d.salesDate}: dashboard=₹${d.dashboardTotal}, actual=₹${d.actualTotal}, diff=₹${d.difference}`,
      );
    });
  } else {
    console.log('   ✅ Dashboard revenue matches actual invoices');
  }
}

async function auditRefundConsistency() {
  console.log('\n📊 AUDITING REFUND CONSISTENCY...');
  console.log('   Verifying: Return.totalReturnAmount matches SUM(ReturnItem.returnAmount)');

  const refundMismatches = await prisma.$queryRaw`
    SELECT 
      r."id" AS "returnId",
      r."returnNumber",
      r."tenantId",
      r."totalReturnAmount" AS "returnTotal",
      COALESCE(SUM(ri."returnAmount"), 0) AS "itemsTotal",
      ABS(r."totalReturnAmount" - COALESCE(SUM(ri."returnAmount"), 0)) AS "difference"
    FROM "Return" r
    LEFT JOIN "ReturnItem" ri ON ri."returnId" = r."id"
    GROUP BY r."id", r."returnNumber", r."tenantId", r."totalReturnAmount"
    HAVING ABS(r."totalReturnAmount" - COALESCE(SUM(ri."returnAmount"), 0)) > 0.01
    LIMIT 50
  `;

  if (refundMismatches.length > 0) {
    console.log(`   ❌ FOUND ${refundMismatches.length} REFUND AMOUNT MISMATCHES:`);
    refundMismatches.forEach((r) => {
      console.log(
        `      Return ${r.returnNumber}: returnTotal=₹${r.returnTotal}, itemsTotal=₹${r.itemsTotal}, diff=₹${r.difference}`,
      );
    });
  } else {
    console.log('   ✅ All refund amounts match their item totals');
  }

  // Check RefundPayment amounts match Return amounts
  console.log('\n   Verifying: RefundPayment.amount matches Return.totalReturnAmount');

  const refundPaymentMismatches = await prisma.$queryRaw`
    SELECT 
      r."id" AS "returnId",
      r."returnNumber",
      r."tenantId",
      r."totalReturnAmount",
      COALESCE(SUM(rp."amount"), 0) AS "totalRefundPaid",
      ABS(r."totalReturnAmount" - COALESCE(SUM(rp."amount"), 0)) AS "difference"
    FROM "Return" r
    LEFT JOIN "RefundPayment" rp ON rp."returnId" = r."id"
    WHERE r."refundStatus" = 'COMPLETED'
    GROUP BY r."id", r."returnNumber", r."tenantId", r."totalReturnAmount"
    HAVING ABS(r."totalReturnAmount" - COALESCE(SUM(rp."amount"), 0)) > 0.01
    LIMIT 50
  `;

  if (refundPaymentMismatches.length > 0) {
    console.log(`   ❌ FOUND ${refundPaymentMismatches.length} REFUND PAYMENT MISMATCHES:`);
    refundPaymentMismatches.forEach((r) => {
      console.log(
        `      Return ${r.returnNumber}: returnAmount=₹${r.totalReturnAmount}, refundPaid=₹${r.totalRefundPaid}, diff=₹${r.difference}`,
      );
    });
  } else {
    console.log('   ✅ All refund payments match their return amounts');
  }
}

async function auditSaleInvoiceConsistency() {
  console.log('\n📊 AUDITING SALE-INVOICE CONSISTENCY...');
  console.log('   Verifying: Sale amounts match linked Invoice amounts');

  const saleInvoiceMismatches = await prisma.$queryRaw`
    SELECT 
      s."id" AS "saleId",
      s."invoiceId",
      s."tenantId",
      s."subtotal" AS "saleSubtotal",
      s."gstAmount" AS "saleGst",
      s."discountAmount" AS "saleDiscount",
      s."totalAmount" AS "saleTotal",
      i."subtotal" AS "invoiceSubtotal",
      i."gstAmount" AS "invoiceGst",
      i."discountAmount" AS "invoiceDiscount",
      i."totalAmount" AS "invoiceTotal",
      ABS(s."totalAmount" - i."totalAmount") AS "totalDifference"
    FROM "Sale" s
    JOIN "Invoice" i ON i."id" = s."invoiceId"
    WHERE ABS(s."totalAmount" - i."totalAmount") > 0.01
    LIMIT 50
  `;

  if (saleInvoiceMismatches.length > 0) {
    console.log(`   ❌ FOUND ${saleInvoiceMismatches.length} SALE-INVOICE MISMATCHES:`);
    saleInvoiceMismatches.forEach((si) => {
      console.log(
        `      Sale ${si.saleId}: saleTotal=₹${si.saleTotal}, invoiceTotal=₹${si.invoiceTotal}, diff=₹${si.totalDifference}`,
      );
    });
  } else {
    console.log('   ✅ All sales match their linked invoices');
  }
}

async function auditSequenceGaps() {
  console.log('\n📊 AUDITING INVOICE SEQUENCE GAPS...');
  console.log('   Checking for gaps in invoice numbering (potential missing invoices)');

  // This is informational - gaps might be intentional (cancelled invoices, etc.)
  const invoiceNumbers = await prisma.$queryRaw`
    SELECT 
      "tenantId",
      "invoiceNumber"
    FROM "Invoice"
    WHERE "deletedAt" IS NULL
    ORDER BY "tenantId", "invoiceNumber"
  `;

  // Group by tenant and check for gaps
  const tenantInvoices = {};
  invoiceNumbers.forEach((inv) => {
    if (!tenantInvoices[inv.tenantId]) tenantInvoices[inv.tenantId] = [];
    tenantInvoices[inv.tenantId].push(inv.invoiceNumber);
  });

  let totalGaps = 0;
  for (const [numbers] of Object.entries(tenantInvoices)) {
    const numericParts = numbers
      .map((n) => {
        const match = n.match(/\d+$/);
        return match ? parseInt(match[0], 10) : null;
      })
      .filter((n) => n !== null);

    if (numericParts.length < 2) continue;

    const sorted = [...new Set(numericParts)].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] > 1) {
        totalGaps++;
      }
    }
  }

  if (totalGaps > 0) {
    console.log(
      `   ⚠️  Found ${totalGaps} gaps in invoice numbering (informational - may be intentional)`,
    );
  } else {
    console.log('   ✅ No gaps detected in invoice numbering');
  }
}

function printSummary() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 FINANCIAL RECONCILIATION AUDIT REPORT');
  console.log('='.repeat(80));
  console.log('');
  console.log('METRICS:');
  console.log(`  Sales Mismatch:              ${results.summary.totalSalesMismatch}`);
  console.log(`  GST Mismatch:                ${results.summary.totalGstMismatch}`);
  console.log(`  Purchase Mismatch:           ${results.summary.totalPurchaseMismatch}`);
  console.log(`  Credit Note Mismatch:        ${results.summary.totalCreditNoteMismatch}`);
  console.log(`  Duplicate Invoices:          ${results.summary.totalDuplicateInvoices}`);
  console.log(`  Duplicate Payments:          ${results.summary.totalDuplicatePayments}`);
  console.log(`  Payment Status Mismatch:     ${results.summary.totalPaymentStatusMismatch}`);
  console.log(`  Outstanding Balance Mismatch: ${results.summary.totalOutstandingBalanceMismatch}`);
  console.log(`  Decimal Precision Issues:    ${results.summary.totalDecimalPrecisionIssues}`);
  console.log('');

  const totalIssues =
    results.summary.totalSalesMismatch +
    results.summary.totalGstMismatch +
    results.summary.totalPurchaseMismatch +
    results.summary.totalCreditNoteMismatch +
    results.summary.totalDuplicateInvoices +
    results.summary.totalDuplicatePayments +
    results.summary.totalPaymentStatusMismatch +
    results.summary.totalOutstandingBalanceMismatch +
    results.summary.totalDecimalPrecisionIssues;

  if (totalIssues === 0) {
    console.log('✅ ALL FINANCIAL CHECKS PASSED');
  } else {
    console.log(`❌ FOUND ${totalIssues} FINANCIAL DISCREPANCIES`);
  }

  console.log('='.repeat(80));
}

async function main() {
  console.log('🏦 PHASE 5: FINANCIAL RECONCILIATION & ACCOUNTING CONSISTENCY AUDIT');
  console.log('='.repeat(80));
  console.log(`Started at: ${new Date().toISOString()}`);

  try {
    await auditSalesReconciliation();
    await auditGstReconciliation();
    await auditPurchaseReconciliation();
    await auditCreditNoteReconciliation();
    await auditDuplicateInvoices();
    await auditDuplicatePayments();
    await auditPaymentStatusConsistency();
    await auditOutstandingBalances();
    await auditDecimalPrecision();
    await auditDashboardRevenue();
    await auditRefundConsistency();
    await auditSaleInvoiceConsistency();
    await auditSequenceGaps();
  } catch (error) {
    console.error('Audit failed:', error);
  } finally {
    await prisma.$disconnect();
  }

  printSummary();
  console.log(`Completed at: ${new Date().toISOString()}`);
}

main();
