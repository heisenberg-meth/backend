import prisma from '../../../config/prisma.js';
import creditNoteRepository from '../repositories/credit-note.repository.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import logger from '../../../shared/utils/logger.js';

class GstAdjustmentService {
  async processGstAdjustment(creditNoteId, tenantId) {
    const creditNote = await creditNoteRepository.findById(creditNoteId, tenantId);

    if (!creditNote) {
      throw new Error('Credit note not found');
    }

    if (creditNote.status === 'VOIDED') {
      throw new Error('Cannot process GST adjustment for voided credit note');
    }

    await prisma.$transaction(async (tx) => {
      const currentMonth = new Date();
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth() + 1;

      let gstSummary = await tx.gstSummary.findFirst({
        where: {
          tenantId,
          year,
          month,
        },
      });

      if (!gstSummary) {
        gstSummary = await tx.gstSummary.create({
          data: {
            tenantId,
            year,
            month,
            totalSales: 0,
            totalGstCollected: 0,
            totalCgst: 0,
            totalSgst: 0,
            totalIgst: 0,
            totalReturns: 0,
            totalGstAdjusted: 0,
          },
        });
      }

      await tx.gstSummary.update({
        where: { id: gstSummary.id },
        data: {
          totalReturns: { increment: creditNote.totalCreditAmount },
          totalGstAdjusted: { increment: creditNote.gstAdjustment },
          totalCgst: { decrement: creditNote.cgstAdjustment },
          totalSgst: { decrement: creditNote.sgstAdjustment },
          totalIgst: { decrement: creditNote.igstAdjustment },
        },
      });

      await tx.hsnSummary.upsert({
        where: {
          tenantId_year_month: {
            tenantId,
            year,
            month,
          },
        },
        create: {
          tenantId,
          year,
          month,
          hsnCode: 'MIXED',
          totalAmount: -creditNote.totalCreditAmount,
          gstAmount: -creditNote.gstAdjustment,
          cgstAmount: -creditNote.cgstAdjustment,
          sgstAmount: -creditNote.sgstAdjustment,
          igstAmount: -creditNote.igstAdjustment,
        },
        update: {
          totalAmount: { increment: -creditNote.totalCreditAmount },
          gstAmount: { increment: -creditNote.gstAdjustment },
          cgstAmount: { increment: -creditNote.cgstAdjustment },
          sgstAmount: { increment: -creditNote.sgstAdjustment },
          igstAmount: { increment: -creditNote.igstAdjustment },
        },
      });
    });

    emitLocalEvent(DOMAIN_EVENTS.GST_ADJUSTED, {
      creditNoteId,
      returnId: creditNote.returnId,
      tenantId,
      gstAdjustment: creditNote.gstAdjustment,
      timestamp: new Date().toISOString(),
    });

    logger.info(
      `[GST] Processed adjustment for credit note ${creditNote.creditNoteNumber}: ₹${creditNote.gstAdjustment}`,
    );

    return {
      creditNoteId,
      gstAdjustment: creditNote.gstAdjustment,
      cgstAdjustment: creditNote.cgstAdjustment,
      sgstAdjustment: creditNote.sgstAdjustment,
      igstAdjustment: creditNote.igstAdjustment,
    };
  }

  async getGstImpact(tenantId, year, month) {
    const gstSummary = await prisma.gstSummary.findFirst({
      where: { tenantId, year, month },
    });

    if (!gstSummary) {
      return {
        totalSales: 0,
        totalReturns: 0,
        netGstPayable: 0,
        gstAdjustments: 0,
      };
    }

    return {
      totalSales: gstSummary.totalSales,
      totalReturns: gstSummary.totalReturns,
      netGstPayable: gstSummary.totalGstCollected - gstSummary.totalGstAdjusted,
      gstAdjustments: gstSummary.totalGstAdjusted,
      cgstPayable: gstSummary.totalCgst,
      sgstPayable: gstSummary.totalSgst,
      igstPayable: gstSummary.totalIgst,
    };
  }

  async getMonthlyGstReport(tenantId, year) {
    const summaries = await prisma.gstSummary.findMany({
      where: { tenantId, year },
      orderBy: { month: 'asc' },
    });

    return summaries.map((s) => ({
      month: s.month,
      totalSales: s.totalSales,
      totalReturns: s.totalReturns,
      gstCollected: s.totalGstCollected,
      gstAdjusted: s.totalGstAdjusted,
      netGstPayable: s.totalGstCollected - s.totalGstAdjusted,
    }));
  }
}

export default new GstAdjustmentService();
