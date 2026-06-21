import prisma from '../../../config/prisma.js';
import movementService from '../../stock/service/movement.service.js';
import cacheInvalidator from '../../inventory/service/cache-invalidator.service.js';
import logger from '../../../shared/utils/logger.js';

class UnifiedRefundOrchestrator {
  /**
   * Universal method to process a refund, whether initiated from Billing or Returns module.
   * Guarantees a single authority for Ledger, Inventory, and Invoice aggregates.
   */
  async processRefund({
    tenantId,
    userId,
    invoiceId,
    items = [],
    refundAmount,
    reason,
    returnId = null,
    refundMethod = 'CASH',
  }) {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock Invoice to prevent parallel refund race conditions
      const invoice = await tx.$queryRaw`
        SELECT * FROM "Invoice" WHERE id = ${invoiceId} AND "tenantId" = ${tenantId} FOR UPDATE
      `;

      if (!invoice || invoice.length === 0) {
        throw new Error('Invoice not found');
      }

      const targetInvoice = invoice[0];

      if (targetInvoice.status === 'CANCELLED')
        throw new Error('Cannot refund a cancelled invoice');
      if (targetInvoice.status === 'REFUNDED')
        throw new Error('Invoice has already been fully refunded');

      // 2. Fetch existing refunds to enforce Ledger Validation
      const previousRefunds = await tx.refundPayment.aggregate({
        where: { invoiceId, refundStatus: 'COMPLETED' },
        _sum: { amount: true },
      });
      const previouslyRefunded = Number(previousRefunds._sum.amount || 0);

      // We need to resolve items if this comes from Billing Route directly
      let actualRefundAmount = refundAmount;
      const resolvedItems = [];

      // If items are passed, we calculate amount and reverse inventory
      if (items.length > 0) {
        // Find invoice items for validation
        const invoiceItems = await tx.invoiceItem.findMany({
          where: { invoiceId },
        });

        let calculatedRefund = 0;

        for (const item of items) {
          const invItem = invoiceItems.find(
            (i) => i.id === item.invoiceItemId || i.medicineId === item.medicineId,
          );
          if (!invItem) throw new Error(`Invoice item not found for refund`);
          if (item.quantity > invItem.quantity) {
            throw new Error(
              `Refund quantity (${item.quantity}) exceeds sold quantity (${invItem.quantity})`,
            );
          }

          const ratio = item.quantity / invItem.quantity;
          const itemRefund = Number(invItem.totalPrice) * ratio;
          calculatedRefund += itemRefund;

          // Restore inventory (fraud protection ensures idempotency)
          if (invItem.batchId) {
            const idempotencyKey = `refund-${invoiceId}-item-${invItem.id}-qty-${item.quantity}-${Date.now()}`;
            await movementService.recordMovement(
              tenantId,
              {
                medicineId: invItem.medicineId,
                batchId: invItem.batchId,
                branchId: targetInvoice.branchId,
                movementType: 'RETURN',
                quantity: item.quantity,
                referenceType: 'REFUND',
                referenceId: invoiceId,
                notes: `Unified Refund return: ${reason}`,
                idempotencyKey,
              },
              userId,
              tx,
            );
          }

          resolvedItems.push({
            invoiceItemId: invItem.id,
            batchId: invItem.batchId,
            quantity: item.quantity,
            amount: itemRefund,
          });
        }

        if (!actualRefundAmount) actualRefundAmount = calculatedRefund;
      }

      actualRefundAmount = Number(actualRefundAmount || 0);

      if (actualRefundAmount <= 0) {
        throw new Error('Refund amount must be greater than zero');
      }

      // 3. Mandatory Refund Ledger Validation
      const proposedTotal = previouslyRefunded + actualRefundAmount;
      const invoiceTotal = Number(targetInvoice.totalAmount);

      if (proposedTotal > invoiceTotal) {
        throw new Error(
          `Fraud Protection: Requested refund (₹${actualRefundAmount}) plus already refunded (₹${previouslyRefunded}) exceeds Invoice total (₹${invoiceTotal}).`,
        );
      }

      // 4. Create Unified Refund Ledger Entry
      const transactionId = `REF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const refundPayment = await tx.refundPayment.create({
        data: {
          tenantId,
          invoiceId,
          returnId: returnId || undefined,
          paymentMode: refundMethod,
          amount: actualRefundAmount,
          transactionReference: transactionId,
          refundStatus: 'COMPLETED',
          createdBy: userId,
        },
      });

      // If called from Billing, we might still create a SalesReturn for legacy compatibility, or just use Return.
      let createdSalesReturn = null;
      if (!returnId && items.length > 0) {
        createdSalesReturn = await tx.salesReturn.create({
          data: {
            tenantId,
            invoiceId,
            saleId: targetInvoice.saleId,
            batchId: resolvedItems[0]?.batchId,
            quantity: items.reduce((sum, i) => sum + i.quantity, 0),
            reason: reason || 'UNIFIED_REFUND',
            refundAmount: actualRefundAmount,
            status: 'REFUNDED',
            createdBy: userId,
          },
        });
      }

      // If called from Returns, update Return record
      let updatedReturn = null;
      if (returnId) {
        updatedReturn = await tx.return.update({
          where: { id: returnId },
          data: {
            refundMethod,
            refundStatus: 'COMPLETED',
            refundTransactionId: transactionId,
            status: 'REFUNDED',
          },
        });
      }

      // 5. Update Invoice aggregates strictly via Unified rules
      const isFullRefund = proposedTotal >= invoiceTotal;
      const totalPaid = Number(targetInvoice.paidAmount);
      const newPaid = Math.max(0, totalPaid - actualRefundAmount);

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          paidAmount: newPaid,
          paymentStatus: newPaid <= 0 ? 'REFUNDED' : 'PARTIALLY_PAID',
        },
      });

      // 6. Create Audit Log
      await tx.invoiceAuditLog.create({
        data: {
          invoiceId,
          action: 'REFUNDED',
          performedBy: userId,
          notes: `Unified refund processed for ₹${actualRefundAmount}. Reason: ${reason}`,
        },
      });

      return {
        refundPayment,
        salesReturn: createdSalesReturn,
        returnRecord: updatedReturn,
        isFullRefund,
        invoiceId,
        tenantId,
        actualRefundAmount,
        medicineIds: resolvedItems.map(i => i.medicineId).filter(Boolean),
      };
    });

    // Invalidate caches after transaction commits
    try {
      if (result.medicineIds && result.medicineIds.length > 0) {
        await cacheInvalidator.invalidateInventoryCaches(tenantId, result.medicineIds);
      } else {
        await cacheInvalidator.invalidateInventoryCaches(tenantId);
      }
    } catch (err) {
      // Non-critical, log but don't fail
      logger.warn('[REFUND] Cache invalidation failed:', err.message);
    }

    return result;
  }
}

export default new UnifiedRefundOrchestrator();
