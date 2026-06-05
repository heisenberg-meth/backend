import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';

class GstReconciliationService {
  async reconcile(tenantId, options = {}) {
    const { from, to } = options;
    const startDate = from
      ? new Date(from)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = to ? new Date(to) : new Date();

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
        status: { not: 'CANCELLED' },
        deletedAt: null,
      },
      include: {
        items: {
          include: { medicine: true },
        },
      },
    });

    const mismatches = [];
    let totalOutputGst = 0;
    let totalInputGst = 0;

    for (const invoice of invoices) {
      const invoiceGst =
        Number(invoice.cgst || 0) + Number(invoice.sgst || 0) + Number(invoice.igst || 0);
      totalOutputGst += invoiceGst;

      let calculatedGst = 0;
      for (const item of invoice.items) {
        const itemTotal = Number(item.unitPrice) * item.quantity;
        const itemGst = itemTotal * (Number(item.gstPercentage) / 100);
        calculatedGst += itemGst;
      }

      const diff = Math.abs(invoiceGst - calculatedGst);
      if (diff > 0.5) {
        mismatches.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          storedGst: invoiceGst,
          calculatedGst: parseFloat(calculatedGst.toFixed(2)),
          difference: parseFloat((invoiceGst - calculatedGst).toFixed(2)),
          itemCount: invoice.items.length,
        });
      }
    }

    const purchaseInvoices = await prisma.purchaseInvoice.findMany({
      where: {
        tenantId,
        invoiceDate: { gte: startDate, lte: endDate },
      },
      select: { gstAmount: true },
    });

    for (const pi of purchaseInvoices) {
      totalInputGst += Number(pi.gstAmount || 0);
    }

    const result = {
      totalChecked: invoices.length,
      mismatchCount: mismatches.length,
      mismatches,
      totalOutputGst: parseFloat(totalOutputGst.toFixed(2)),
      totalInputGst: parseFloat(totalInputGst.toFixed(2)),
      netGstLiability: parseFloat((totalOutputGst - totalInputGst).toFixed(2)),
      period: { from: startDate, to: endDate },
    };

    if (mismatches.length > 0) {
      emitLocalEvent(EVENTS.GST_MISMATCH_DETECTED, {
        tenantId,
        mismatchCount: mismatches.length,
        period: result.period,
        timestamp: new Date().toISOString(),
      });
    }

    emitLocalEvent(EVENTS.GST_RECONCILIATION_COMPLETED, {
      tenantId,
      totalChecked: result.totalChecked,
      mismatchCount: result.mismatchCount,
      timestamp: new Date().toISOString(),
    });

    logger.info(
      `[GST] Reconciliation complete: ${result.totalChecked} checked, ${result.mismatchCount} mismatches`,
    );
    return result;
  }

  async generateReconciliationReport(tenantId, options = {}) {
    const result = await this.reconcile(tenantId, options);

    const csvLines = ['Invoice #,Stored GST,Calculated GST,Difference,Items'];
    for (const m of result.mismatches) {
      csvLines.push(
        `${m.invoiceNumber},${m.storedGst},${m.calculatedGst},${m.difference},${m.itemCount}`,
      );
    }

    const csv = csvLines.join('\n');

    return {
      matchedCount: result.totalChecked - result.mismatchCount,
      mismatchCount: result.mismatchCount,
      totalChecked: result.totalChecked,
      netGstLiability: result.netGstLiability,
      csvData: csv,
    };
  }
}

export default new GstReconciliationService();
