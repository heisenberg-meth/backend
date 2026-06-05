import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';
import refundEligibility from './refund-eligibility.service.js';
import refundCalculation from './refund-calculation.service.js';
import sequenceService from '../../../shared/services/sequence.service.js';
import refundInventory from './refund-inventory.service.js';
import refundFraud from './refund-fraud.service.js';
import refundAudit from './refund-audit.service.js';
import refundRepository from '../repositories/refund.repository.js';

class RefundOrchestrationService {
  async createRefund(tenantId, data, userId) {
    const { invoiceId, items: requestedItems, reason, branchId } = data;

    const invoice = await refundRepository.findInvoiceWithItems(invoiceId);
    const invoiceValidation = refundEligibility.validateInvoice(invoice);
    if (!invoiceValidation.eligible) {
      throw new Error(invoiceValidation.reason);
    }

    const windowValidation = refundEligibility.validateReturnWindow(invoice);
    if (!windowValidation.eligible) {
      throw new Error(windowValidation.reason);
    }

    const existingReturns = await refundRepository.findExistingRefunds(invoiceId);
    const refundItems = [];
    let totalRefundAmount = 0;
    let totalGstAdjustment = 0;
    let requiresApproval = false;
    const approvalReasons = [];

    for (const req of requestedItems) {
      const invoiceItem = invoice.items.find((i) => i.id === req.invoiceItemId);
      if (!invoiceItem) {
        throw new Error(`Invoice item ${req.invoiceItemId} not found`);
      }

      const quantityValidation = refundEligibility.validateRefundQuantity(
        invoiceItem,
        req.quantity,
      );
      if (!quantityValidation.valid) {
        throw new Error(quantityValidation.reason);
      }

      const itemEligibility = refundEligibility.validateItemEligibility({
        ...invoiceItem,
        medicine: invoiceItem.medicine,
        returnedQuantity: 0,
      });
      if (!itemEligibility.eligible) {
        throw new Error(
          `Item ${invoiceItem.medicine?.name || invoiceItem.id}: ${itemEligibility.reason}`,
        );
      }

      const duplicateCheck = refundEligibility.checkDuplicateRefund(
        existingReturns,
        req.invoiceItemId,
      );
      if (duplicateCheck.duplicate) {
        throw new Error(duplicateCheck.reason);
      }

      const amounts = refundCalculation.calculateRefundAmount(invoiceItem, req.quantity);

      refundItems.push({
        invoiceItemId: invoiceItem.id,
        medicineId: invoiceItem.medicineId,
        batchId: invoiceItem.batchId,
        returnedQuantity: req.quantity,
        originalQuantity: invoiceItem.quantity,
        unitPrice: Number(invoiceItem.unitPrice),
        gstPercentage: Number(invoiceItem.gstPercentage),
        returnAmount: amounts.totalRefund,
        gstAdjustment: amounts.gstAmount,
        disposition: 'PENDING',
      });

      totalRefundAmount += amounts.totalRefund;
      totalGstAdjustment += amounts.gstAmount;

      if (itemEligibility.requiresApproval) {
        requiresApproval = true;
        approvalReasons.push(invoiceItem.medicine?.name || invoiceItem.id);
      }
    }

    const approvalResult = await refundEligibility.determineApprovalRequired(
      refundItems.map((r, i) => ({
        ...r,
        invoiceItemId: requestedItems[i].invoiceItemId,
        medicineName: invoice.items.find((it) => it.id === requestedItems[i].invoiceItemId)
          ?.medicine?.name,
      })),
      totalRefundAmount,
    );
    if (approvalResult.requiresApproval) {
      requiresApproval = true;
      approvalReasons.push(...approvalResult.reasons);
    }

    const fraudResult = await refundFraud.evaluateRefund(
      tenantId,
      invoice.patientId,
      refundItems.map((r, i) => ({
        ...r,
        invoiceItemId: requestedItems[i].invoiceItemId,
        medicine: invoice.items.find((it) => it.id === requestedItems[i].invoiceItemId)?.medicine,
      })),
      totalRefundAmount,
      existingReturns,
    );

    const refund = await prisma.$transaction(async (tx) => {
      const returnNumber = await sequenceService.nextRefundNumber(tenantId, tx);
      const created = await tx.return.create({
        data: {
          tenantId,
          branchId: branchId || invoice.branchId,
          returnNumber,
          invoiceId,
          patientId: invoice.patientId,
          returnReason: reason || 'PATIENT_RETURN',
          status: requiresApproval ? 'UNDER_REVIEW' : 'APPROVED',
          totalReturnAmount: totalRefundAmount,
          totalGstAdjustment,
          approvalRequired: requiresApproval,
          fraudScore: fraudResult.fraudScore,
          fraudFlags: fraudResult.fraudFlags,
          createdBy: userId,
          items: {
            create: refundItems,
          },
        },
        include: {
          items: { include: { medicine: true, batch: true } },
          invoice: true,
          patient: true,
        },
      });

      if (created.status === 'APPROVED') {
        await refundInventory.restoreStock(tenantId, created.id, created.items, tx);

        await tx.creditNote.create({
          data: {
            tenantId,
            creditNoteNumber: `CN-${created.returnNumber}`,
            returnId: created.id,
            invoiceId,
            totalCreditAmount: totalRefundAmount,
            gstAdjustment: totalGstAdjustment,
            cgstAdjustment: totalGstAdjustment / 2,
            sgstAdjustment: totalGstAdjustment / 2,
            status: 'ISSUED',
            createdBy: userId,
          },
        });

        await refundRepository.updateRefundStatus(
          created.id,
          {
            status: 'COMPLETED',
            refundStatus: 'COMPLETED',
          },
          tx,
        );
        created.status = 'COMPLETED';
        created.refundStatus = 'COMPLETED';
      }

      return created;
    });

    const eventStatus =
      refund.status === 'COMPLETED' ? EVENTS.REFUND_COMPLETED : EVENTS.RETURN_CREATED;
    emitLocalEvent(eventStatus, {
      returnId: refund.id,
      returnNumber: refund.returnNumber,
      invoiceId,
      totalRefundAmount,
      requiresApproval,
      fraudScore: fraudResult.fraudScore,
      fraudFlags: fraudResult.fraudFlags,
      timestamp: new Date().toISOString(),
    });

    if (refund.status === 'COMPLETED') {
      refundAudit.logInvoiceAudit(invoiceId, 'REFUNDED', userId);

      emitLocalEvent(EVENTS.GST_ADJUSTED, {
        returnId: refund.id,
        invoiceId,
        gstAdjustment: totalGstAdjustment,
        timestamp: new Date().toISOString(),
      });
    }

    refundAudit.logAction(tenantId, refund.id, `REFUND_CREATED:${refund.status}`, userId, {
      totalRefundAmount,
      itemCount: refundItems.length,
      fraudScore: fraudResult.fraudScore,
    });

    logger.info(
      `[Refund] Created refund ${refund.returnNumber} (status: ${refund.status}), amount: ₹${totalRefundAmount}`,
    );

    return refund;
  }
}

export default new RefundOrchestrationService();
