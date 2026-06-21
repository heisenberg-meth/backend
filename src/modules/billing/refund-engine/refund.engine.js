import unifiedRefundOrchestrator from '../../refunds/services/unified-refund.orchestrator.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import logger from '../../../shared/utils/logger.js';
import prisma from '../../../config/prisma.js';
import movementService from '../../stock/service/movement.service.js';

class RefundEngine {
  async processRefund(tenantId, userId, data) {
    const result = await unifiedRefundOrchestrator.processRefund({
      tenantId,
      userId,
      invoiceId: data.invoiceId,
      items: data.items,
      refundAmount: data.refundAmount,
      reason: data.reason,
    });

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
      logger.error({ err, invoiceId: result.invoiceId, tenantId }, 'Failed to publish refund events — scheduling retry');
      try {
        const { mainQueue } = await import('../../../queue/index.js');
        await mainQueue.add(
          'retry-refund-events',
          { invoiceId: result.invoiceId, tenantId, attempt: 1 },
          { attempts: 5, backoff: { type: 'exponential', delay: 15000 } },
        );
      } catch (queueErr) {
        logger.error({ err: queueErr, invoiceId: result.invoiceId }, 'CRITICAL: Failed to queue refund event retry');
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
