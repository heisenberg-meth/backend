import unifiedRefundOrchestrator from '../../refunds/services/unified-refund.orchestrator.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import logger from '../../../shared/utils/logger.js';
import prisma from '../../../config/prisma.js';
import movementService from '../../stock/service/movement.service.js';

class RefundEngine {
  async processRefund(arg1, arg2, arg3, arg4) {
    let tenantId, userId, payload;

    if (
      arg4 !== undefined ||
      (typeof arg1 === 'string' &&
        typeof arg2 === 'string' &&
        typeof arg3 === 'string' &&
        typeof arg4 === 'object')
    ) {
      // Called as: processRefund(returnId, tenantId, userId, options)
      const returnId = arg1;
      tenantId = arg2;
      userId = arg3;
      const options = arg4 || {};

      const returnRecord = await prisma.return.findUnique({
        where: { id: returnId },
        include: { items: true, invoice: true },
      });

      if (!returnRecord || returnRecord.tenantId !== tenantId) {
        throw new Error('Return not found');
      }

      if (returnRecord.status !== 'APPROVED') {
        throw new Error(`Cannot process refund for return in status: ${returnRecord.status}`);
      }

      if (returnRecord.refundStatus === 'COMPLETED') {
        throw new Error('Refund already completed');
      }

      payload = {
        tenantId,
        userId,
        returnId,
        invoiceId: returnRecord.invoiceId,
        refundAmount: returnRecord.totalReturnAmount,
        reason: options.reason || returnRecord.returnReason,
        refundMethod: options.refundMethod || returnRecord.refundMethod || 'CASH',
        sessionId: options.sessionId,
      };
    } else {
      // Called as: processRefund(tenantId, userId, data)
      tenantId = arg1;
      userId = arg2;
      const data = arg3 || {};
      payload = {
        tenantId,
        userId,
        invoiceId: data.invoiceId,
        items: data.items,
        refundAmount: data.refundAmount,
        reason: data.reason,
        returnId: data.returnId,
        refundMethod: data.refundMethod,
        sessionId: data.sessionId,
      };
    }

    const result = await unifiedRefundOrchestrator.processRefund(payload);

    try {
      emitLocalEvent(DOMAIN_EVENTS.REFUND_PROCESSED, {
        invoiceId: result.invoiceId,
        refundAmount: result.actualRefundAmount,
        tenantId,
      });
      emitLocalEvent(DOMAIN_EVENTS.SALE_RETURNED, {
        invoiceId: result.invoiceId,
        tenantId,
        refundAmount: result.actualRefundAmount,
      });
      await emitEvent(DOMAIN_EVENTS.REFUND_PROCESSED, { invoiceId: result.invoiceId, tenantId });
    } catch (err) {
      logger.error(
        { err, invoiceId: result.invoiceId, tenantId },
        'Failed to publish refund events — scheduling retry',
      );
      try {
        const { mainQueue } = await import('../../../queue/index.js');
        await mainQueue.add(
          'retry-refund-events',
          { invoiceId: result.invoiceId, tenantId, attempt: 1 },
          { attempts: 5, backoff: { type: 'exponential', delay: 15000 } },
        );
      } catch (queueErr) {
        logger.error(
          { err: queueErr, invoiceId: result.invoiceId },
          'CRITICAL: Failed to queue refund event retry',
        );
      }
    }

    return { salesReturn: result.salesReturn, isFullRefund: result.isFullRefund };
  }

  async cancelInvoice(tenantId, invoiceId, userId, reason) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true },
    });

    if (!invoice || invoice.tenantId !== tenantId) throw new Error('Invoice not found');
    if (invoice.status === 'CANCELLED') throw new Error('Invoice is already cancelled');

    return prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'CANCELLED',
          paymentStatus: 'REFUNDED',
          paidAmount: 0,
          balanceAmount: 0,
          notes: reason ? `${invoice.notes || ''}\nCancelled: ${reason}` : invoice.notes,
        },
      });

      for (const item of invoice.items) {
        if (item.batchId) {
          const idempotencyKey = `cancel-invoice-${invoiceId}-item-${item.id}`;
          await movementService.recordMovement(
            tenantId,
            {
              medicineId: item.medicineId,
              batchId: item.batchId,
              branchId: invoice.branchId,
              movementType: 'ADJUSTMENT',
              quantity: item.quantity,
              referenceType: 'CANCEL_INVOICE',
              referenceId: invoiceId,
              notes: `Cancelling invoice ${invoice.invoiceNumber}: ${reason || ''}`,
              idempotencyKey,
            },
            userId,
            tx,
          );
        }
      }

      await tx.invoiceAuditLog.create({
        data: {
          invoiceId: invoice.id,
          action: 'CANCELLED',
          performedBy: userId,
          notes: reason,
        },
      });

      emitLocalEvent(DOMAIN_EVENTS.INVOICE_CANCELLED, { invoiceId, tenantId });

      return { success: true, message: 'Invoice cancelled and stock reversed' };
    });
  }
}

export default new RefundEngine();
