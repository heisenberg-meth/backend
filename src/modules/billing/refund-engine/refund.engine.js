import prisma from '../../../config/prisma.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import movementService from '../../stock/service/movement.service.js';

class RefundEngine {
  async processRefund(tenantId, userId, data) {
    const { invoiceId, reason, items = [], refundAmount } = data;

    return prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { items: true, sale: true },
      });

      if (!invoice || invoice.tenantId !== tenantId) throw new Error('Invoice not found');
      if (invoice.status === 'CANCELLED') throw new Error('Cannot refund a cancelled invoice');

      const refundedItems = [];
      let totalCalculatedRefund = 0;

      for (const item of items) {
        const invoiceItem = invoice.items.find((i) => i.id === item.invoiceItemId);
        if (!invoiceItem) throw new Error(`Invoice item ${item.invoiceItemId} not found`);

        if (item.quantity > invoiceItem.quantity) {
          throw new Error(
            `Refund quantity (${item.quantity}) exceeds invoiced quantity (${invoiceItem.quantity})`,
          );
        }

        const itemRatio = item.quantity / invoiceItem.quantity;
        const itemRefundAmount = Number(invoiceItem.totalPrice) * itemRatio;
        totalCalculatedRefund += itemRefundAmount;

        if (invoiceItem.batchId) {
          const idempotencyKey = `refund-${invoiceId}-item-${item.invoiceItemId}`;
          await movementService.recordMovement(
            tenantId,
            {
              medicineId: invoiceItem.medicineId,
              batchId: invoiceItem.batchId,
              branchId: invoice.branchId,
              movementType: 'RETURN',
              quantity: item.quantity,
              referenceType: 'REFUND',
              referenceId: invoice.id,
              notes: `Refund return: ${reason}`,
              idempotencyKey,
            },
            userId,
            tx,
          );
        }

        refundedItems.push({
          invoiceItemId: item.invoiceItemId,
          quantity: item.quantity,
          amount: itemRefundAmount,
        });
      }

      const actualRefundAmount = refundAmount || totalCalculatedRefund;

      const salesReturn = await tx.salesReturn.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          saleId: invoice.saleId,
          batchId: items[0]?.batchId || invoice.items[0]?.batchId,
          quantity: items.reduce((sum, i) => sum + i.quantity, 0),
          reason,
          refundAmount: actualRefundAmount,
          status: 'COMPLETED',
          createdBy: userId,
        },
      });

      const isFullRefund =
        actualRefundAmount >= Number(invoice.totalAmount) - (Number(invoice.refundedAmount) || 0);

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });

      emitLocalEvent(DOMAIN_EVENTS.REFUND_PROCESSED, {
        invoiceId,
        refundAmount: actualRefundAmount,
        tenantId,
      });
      await emitEvent(DOMAIN_EVENTS.REFUND_PROCESSED, { invoiceId, tenantId });

      return { salesReturn, isFullRefund };
    });
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
