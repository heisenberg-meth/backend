import prisma from '../../../config/prisma.js';
import creditNoteRepository from '../repositories/credit-note.repository.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import logger from '../../../shared/utils/logger.js';

class CreditNoteService {
  async generateCreditNote(returnId, tenantId, userId, notes) {
    const returnRecord = await prisma.return.findUnique({
      where: { id: returnId, tenantId },
      include: {
        items: true,
        invoice: true,
      },
    });

    if (!returnRecord) {
      throw new Error('Return not found');
    }

    if (returnRecord.status !== 'APPROVED' && returnRecord.status !== 'REFUNDED') {
      throw new Error(`Cannot generate credit note for return in status: ${returnRecord.status}`);
    }

    const existingCreditNotes = await creditNoteRepository.findByReturnId(returnId, tenantId);
    if (existingCreditNotes.length > 0) {
      throw new Error('Credit note already generated for this return');
    }

    const creditNoteNumber = await creditNoteRepository.generateCreditNoteNumber(
      tenantId,
      returnRecord.invoice.branch?.code || 'GEN'
    );

    let totalCreditAmount = 0;
    let totalGstAdjustment = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    returnRecord.items.forEach((item) => {
      totalCreditAmount += item.returnAmount;
      totalGstAdjustment += item.gstAdjustment;

      const isInterState = returnRecord.invoice.igst > 0;
      if (isInterState) {
        totalIgst += item.gstAdjustment;
      } else {
        totalCgst += item.gstAdjustment / 2;
        totalSgst += item.gstAdjustment / 2;
      }
    });

    const creditNote = await creditNoteRepository.createCreditNote(
      {
        tenantId,
        creditNoteNumber,
        returnId,
        invoiceId: returnRecord.invoiceId,
        totalCreditAmount,
        gstAdjustment: totalGstAdjustment,
        cgstAdjustment: totalCgst,
        sgstAdjustment: totalSgst,
        igstAdjustment: totalIgst,
        notes,
        createdBy: userId,
      },
      prisma
    );

    emitLocalEvent(DOMAIN_EVENTS.CREDIT_NOTE_GENERATED, {
      creditNoteId: creditNote.id,
      returnId,
      invoiceId: returnRecord.invoiceId,
      tenantId,
      totalCreditAmount,
      timestamp: new Date().toISOString(),
    });

    await emitEvent(DOMAIN_EVENTS.CREDIT_NOTE_GENERATED, {
      creditNoteId: creditNote.id,
      returnId,
      tenantId,
    });

    logger.info(`[CreditNote] Generated ${creditNoteNumber} for return ${returnRecord.returnNumber}`);

    return creditNote;
  }

  async getCreditNote(creditNoteId, tenantId) {
    const creditNote = await creditNoteRepository.findById(creditNoteId, tenantId);

    if (!creditNote) {
      throw new Error('Credit note not found');
    }

    return creditNote;
  }

  async getCreditNotesByReturn(returnId, tenantId) {
    return creditNoteRepository.findByReturnId(returnId, tenantId);
  }

  async voidCreditNote(creditNoteId, tenantId, userId, reason) {
    const creditNote = await creditNoteRepository.findById(creditNoteId, tenantId);

    if (!creditNote) {
      throw new Error('Credit note not found');
    }

    if (creditNote.status === 'VOIDED') {
      throw new Error('Credit note is already voided');
    }

    if (creditNote.status === 'APPLIED') {
      throw new Error('Cannot void an applied credit note');
    }

    const updated = await creditNoteRepository.updateStatus(creditNoteId, 'VOIDED', prisma);

    logger.info(`[CreditNote] Voided ${creditNote.creditNoteNumber}: ${reason}`);

    return updated;
  }
}

export default new CreditNoteService();
